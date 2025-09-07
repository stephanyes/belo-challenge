describe('Transactions Integration Tests', () => {
  let fastify;
  let mockClient;
  
  beforeAll(async () => {
    fastify = {
      pg: {
        query: jest.fn(),
        connect: jest.fn()
      }
    };
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    fastify.pg.connect.mockResolvedValue(mockClient);
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('GET /transactions', () => {
    it('should return all transactions when no userId provided', async () => {
      const mockTransactions = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          origen: '123e4567-e89b-12d3-a456-426614174001',
          destino: '123e4567-e89b-12d3-a456-426614174002',
          monto: 100.50,
          estado: 'confirmada',
          fecha: '2024-01-01T10:00:00Z',
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z'
        }
      ];
      
      fastify.pg.query.mockResolvedValue({ rows: mockTransactions });
      
      const result = await getTransactions(fastify, {});
      
      expect(result.transactions).toEqual(mockTransactions);
      expect(fastify.pg.query).toHaveBeenCalledWith(
        'SELECT * FROM transactions ORDER BY fecha DESC',
        []
      );
    });
    
    it('should return filtered transactions when userId provided', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174001';
      const mockTransactions = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          origen: userId,
          destino: '123e4567-e89b-12d3-a456-426614174002',
          monto: 100.50,
          estado: 'confirmada',
          fecha: '2024-01-01T10:00:00Z'
        }
      ];
      
      fastify.pg.query.mockResolvedValue({ rows: mockTransactions });
      
      const result = await getTransactions(fastify, { userId });
      
      expect(result.transactions).toEqual(mockTransactions);
      expect(fastify.pg.query).toHaveBeenCalledWith(
        'SELECT * FROM transactions WHERE origen = $1 OR destino = $1 ORDER BY fecha DESC',
        [userId]
      );
    });
    
    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      fastify.pg.query.mockRejectedValue(error);
      
      const result = await getTransactions(fastify, {});
      
      expect(result.error).toBe('Failed to fetch transactions');
      expect(result.details).toBe('Database connection failed');
    });
  });
  
  describe('POST /transactions', () => {
    it('should create confirmed transaction for ≤ $50,000', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 25000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 50000.00 },
        { id: transactionData.destino, saldo: 10000.00 }
      ];
      
      const mockTransaction = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        ...transactionData,
        estado: 'confirmada',
        fecha: '2024-01-01T10:00:00Z'
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Insert transaction
        .mockResolvedValueOnce({ rows: [] }) // Audit log
        .mockResolvedValueOnce({ rows: [] }) // Update origin balance
        .mockResolvedValueOnce({ rows: [] }) // Update destination balance
        .mockResolvedValueOnce({ rows: [] }) // Audit log origin
        .mockResolvedValueOnce({ rows: [] }) // Audit log destination
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      const result = await createTransaction(fastify, transactionData);
      
      expect(result.message).toBe('Transaction created and confirmed');
      expect(result.transaction.estado).toBe('confirmada');
    });
    
    it('should create pending transaction for > $50,000', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 75000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 100000.00 },
        { id: transactionData.destino, saldo: 10000.00 }
      ];
      
      const mockTransaction = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        ...transactionData,
        estado: 'pendiente',
        fecha: '2024-01-01T10:00:00Z'
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Insert transaction
        .mockResolvedValueOnce({ rows: [] }) // Audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      const result = await createTransaction(fastify, transactionData);
      
      expect(result.message).toBe('Transaction created pending approval');
      expect(result.transaction.estado).toBe('pendiente');
    });
    
    it('should handle insufficient funds error', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 100000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 50000.00 }, // Insufficient balance
        { id: transactionData.destino, saldo: 10000.00 }
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const result = await createTransaction(fastify, transactionData);
      
      expect(result.error).toBe('Insufficient funds');
    });
    
    it('should handle user not found error', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 10000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 50000.00 }
        // Missing destination user
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const result = await createTransaction(fastify, transactionData);
      
      expect(result.error).toBe('Origin or destination user not found');
    });
  });
  
  describe('PATCH /transactions/:id/approve', () => {
    it('should approve pending transaction successfully', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 10000.00,
        estado: 'pendiente'
      };
      
      const mockOriginUser = { saldo: 50000.00 };
      const mockDestUser = { saldo: 10000.00 };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [mockOriginUser] }) // Get origin user
        .mockResolvedValueOnce({ rows: [mockDestUser] }) // Get destination user
        .mockResolvedValueOnce({ rows: [] }) // Update origin balance
        .mockResolvedValueOnce({ rows: [] }) // Update destination balance
        .mockResolvedValueOnce({ rows: [] }) // Audit log origin
        .mockResolvedValueOnce({ rows: [] }) // Audit log destination
        .mockResolvedValueOnce({ rows: [{ ...mockTransaction, estado: 'confirmada' }] }) // Update transaction
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      const result = await approveTransaction(fastify, transactionId);
      
      expect(result.message).toBe('Transaction approved successfully');
      expect(result.transaction.estado).toBe('confirmada');
    });
    
    it('should handle transaction not found error', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Get transaction (not found)
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const result = await approveTransaction(fastify, transactionId);
      
      expect(result.error).toBe('Transaction not found');
    });
    
    it('should handle transaction not pending error', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        estado: 'confirmada'
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const result = await approveTransaction(fastify, transactionId);
      
      expect(result.error).toBe('Transaction is not pending');
    });
    
    it('should handle insufficient funds error', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        origen: '123e4567-e89b-12d3-a456-426614174000',
        monto: 100000.00,
        estado: 'pendiente'
      };
      
      const mockOriginUser = { saldo: 50000.00 }; // Insufficient balance
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [mockOriginUser] }) // Get origin user
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      const result = await approveTransaction(fastify, transactionId);
      
      expect(result.error).toBe('Insufficient funds');
    });
  });
  
  describe('PATCH /transactions/:id/reject', () => {
    it('should reject pending transaction successfully', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        origen: '123e4567-e89b-12d3-a456-426614174000',
        monto: 10000.00,
        estado: 'pendiente'
      };
      
      fastify.pg.query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [{ ...mockTransaction, estado: 'rechazada' }] }) // Update transaction
        .mockResolvedValueOnce({ rows: [] }); // Audit log
      
      const result = await rejectTransaction(fastify, transactionId);
      
      expect(result.message).toBe('Transaction rejected successfully');
      expect(result.transaction.estado).toBe('rechazada');
    });
    
    it('should handle transaction not found error', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      
      fastify.pg.query.mockResolvedValueOnce({ rows: [] }); // Get transaction (not found)
      
      const result = await rejectTransaction(fastify, transactionId);
      
      expect(result.error).toBe('Transaction not found');
    });
    
    it('should handle transaction not pending error', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        estado: 'confirmada'
      };
      
      fastify.pg.query.mockResolvedValueOnce({ rows: [mockTransaction] }); // Get transaction
      
      const result = await rejectTransaction(fastify, transactionId);
      
      expect(result.error).toBe('Transaction is not pending');
    });
  });
});

async function getTransactions(fastify, query) {
  try {
    const { userId } = query;
    
    let queryStr = 'SELECT * FROM transactions';
    let params = [];
    
    if (userId) {
      queryStr += ' WHERE origen = $1 OR destino = $1';
      params = [userId];
    }
    
    queryStr += ' ORDER BY fecha DESC';
    
    const result = await fastify.pg.query(queryStr, params);
    return { transactions: result.rows };
  } catch (error) {
    return { error: 'Failed to fetch transactions', details: error.message };
  }
}

async function createTransaction(fastify, transactionData) {
  const client = await fastify.pg.connect();
  
  try {
    await client.query('BEGIN');
    
    const { origen, destino, monto } = transactionData;
    
    const usersResult = await client.query(
      'SELECT id, saldo FROM users WHERE id IN ($1, $2) FOR UPDATE',
      [origen, destino]
    );
    
    if (usersResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      return { error: 'Origin or destination user not found' };
    }
    
    const originUser = usersResult.rows.find(u => u.id === origen);
    if (originUser.saldo < monto) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient funds' };
    }
    
    const estado = monto > 50000 ? 'pendiente' : 'confirmada';
    
    const transactionResult = await client.query(
      'INSERT INTO transactions (origen, destino, monto, estado) VALUES ($1, $2, $3, $4) RETURNING *',
      [origen, destino, monto, estado]
    );
    
    const transaction = transactionResult.rows[0];
    
    await client.query(
      'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, description) VALUES ($1, $2, $3, $4, $5)',
      [origen, transaction.id, 'transaction_created', monto, `Transaction created - ${estado}`]
    );
    
    if (estado === 'confirmada') {
      const destUser = usersResult.rows.find(u => u.id === destino);
      
      await client.query(
        'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
        [monto, origen]
      );
      
      await client.query(
        'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
        [monto, destino]
      );
      
      await client.query(
        'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [origen, transaction.id, 'debit', monto, originUser.saldo, originUser.saldo - monto, 'Transaction confirmed - debit']
      );
      
      await client.query(
        'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [destino, transaction.id, 'credit', monto, destUser.saldo, destUser.saldo + monto, 'Transaction confirmed - credit']
      );
    }
    
    await client.query('COMMIT');
    
    return {
      message: estado === 'confirmada' ? 'Transaction created and confirmed' : 'Transaction created pending approval',
      transaction
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    return { error: 'Failed to create transaction', details: error.message };
  } finally {
    client.release();
  }
}

async function approveTransaction(fastify, transactionId) {
  const client = await fastify.pg.connect();
  
  try {
    await client.query('BEGIN');
    
    const transactionResult = await client.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    
    if (transactionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Transaction not found' };
    }
    
    const transaction = transactionResult.rows[0];
    
    if (transaction.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return { error: 'Transaction is not pending' };
    }
    
    const originUserResult = await client.query(
      'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
      [transaction.origen]
    );
    
    const originSaldo = parseFloat(originUserResult.rows[0].saldo);
    
    if (originSaldo < transaction.monto) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient funds' };
    }
    
    const destUserResult = await client.query(
      'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
      [transaction.destino]
    );
    const destSaldo = parseFloat(destUserResult.rows[0].saldo);
    
    await client.query(
      'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
      [transaction.monto, transaction.origen]
    );
    
    await client.query(
      'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
      [transaction.monto, transaction.destino]
    );
    
    await client.query(
      'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [transaction.origen, transactionId, 'debit', transaction.monto, originSaldo, originSaldo - transaction.monto, 'Transaction approved - debit']
    );
    
    await client.query(
      'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [transaction.destino, transactionId, 'credit', transaction.monto, destSaldo, destSaldo + transaction.monto, 'Transaction approved - credit']
    );
    
    const updatedTransactionResult = await client.query(
      'UPDATE transactions SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['confirmada', transactionId]
    );
    
    await client.query('COMMIT');
    
    return {
      message: 'Transaction approved successfully',
      transaction: updatedTransactionResult.rows[0]
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    return { error: 'Failed to approve transaction', details: error.message };
  } finally {
    client.release();
  }
}

async function rejectTransaction(fastify, transactionId) {
  try {
    const transactionResult = await fastify.pg.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    
    if (transactionResult.rows.length === 0) {
      return { error: 'Transaction not found' };
    }
    
    const transaction = transactionResult.rows[0];
    
    if (transaction.estado !== 'pendiente') {
      return { error: 'Transaction is not pending' };
    }
    
    const updatedTransactionResult = await fastify.pg.query(
      'UPDATE transactions SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['rechazada', transactionId]
    );
    
    await fastify.pg.query(
      'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, description) VALUES ($1, $2, $3, $4, $5)',
      [transaction.origen, transactionId, 'transaction_rejected', transaction.monto, 'Transaction rejected']
    );
    
    return {
      message: 'Transaction rejected successfully',
      transaction: updatedTransactionResult.rows[0]
    };
    
  } catch (error) {
    return { error: 'Failed to reject transaction', details: error.message };
  }
}
