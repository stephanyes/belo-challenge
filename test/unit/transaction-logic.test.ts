describe('Transaction Logic', () => {
  let mockClient: any;
  
  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      connect: jest.fn(),
      release: jest.fn()
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
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
        origen: transactionData.origen,
        destino: transactionData.destino,
        monto: transactionData.monto,
        estado: 'confirmada',
        fecha: new Date().toISOString()
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
      
      const result = await createTransaction(mockClient, transactionData);
      
      expect(result.estado).toBe('confirmada');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
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
        origen: transactionData.origen,
        destino: transactionData.destino,
        monto: transactionData.monto,
        estado: 'pendiente',
        fecha: new Date().toISOString()
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Insert transaction
        .mockResolvedValueOnce({ rows: [] }) // Audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      const result = await createTransaction(mockClient, transactionData);
      
      expect(result.estado).toBe('pendiente');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
    
    it('should update balances for confirmed transactions', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 10000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 50000.00 },
        { id: transactionData.destino, saldo: 10000.00 }
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [{ id: 'tx-id', ...transactionData, estado: 'confirmada' }] }) // Insert transaction
        .mockResolvedValueOnce({ rows: [] }) // Audit log
        .mockResolvedValueOnce({ rows: [] }) // Update origin balance
        .mockResolvedValueOnce({ rows: [] }) // Update destination balance
        .mockResolvedValueOnce({ rows: [] }) // Audit log origin
        .mockResolvedValueOnce({ rows: [] }) // Audit log destination
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      await createTransaction(mockClient, transactionData);
      
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
        [transactionData.monto, transactionData.origen]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
        [transactionData.monto, transactionData.destino]
      );
    });
    
    it('should not update balances for pending transactions', async () => {
      const transactionData = {
        origen: '123e4567-e89b-12d3-a456-426614174000',
        destino: '123e4567-e89b-12d3-a456-426614174001',
        monto: 75000.00
      };
      
      const mockUsers = [
        { id: transactionData.origen, saldo: 100000.00 },
        { id: transactionData.destino, saldo: 10000.00 }
      ];
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockUsers }) // Users query
        .mockResolvedValueOnce({ rows: [{ id: 'tx-id', ...transactionData, estado: 'pendiente' }] }) // Insert transaction
        .mockResolvedValueOnce({ rows: [] }) // Audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      await createTransaction(mockClient, transactionData);
      
      expect(mockClient.query).not.toHaveBeenCalledWith(
        'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
        expect.any(Array)
      );
      expect(mockClient.query).not.toHaveBeenCalledWith(
        'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
        expect.any(Array)
      );
    });
  });
  
  describe('PATCH /transactions/:id/approve', () => {
    it('should approve pending transaction', async () => {
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
      
      const result = await approveTransaction(mockClient, transactionId);
      
      expect(result.estado).toBe('confirmada');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
    
    it('should reject already processed transaction', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        estado: 'confirmada'
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      
      await expect(approveTransaction(mockClient, transactionId)).rejects.toThrow('Transaction is not pending');
      
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
  
  describe('PATCH /transactions/:id/reject', () => {
    it('should reject pending transaction', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        origen: '123e4567-e89b-12d3-a456-426614174000',
        monto: 10000.00,
        estado: 'pendiente'
      };
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockTransaction] }) // Get transaction
        .mockResolvedValueOnce({ rows: [{ ...mockTransaction, estado: 'rechazada' }] }) // Update transaction
        .mockResolvedValueOnce({ rows: [] }); // Audit log
      
      const result = await rejectTransaction(mockClient, transactionId);
      
      expect(result.estado).toBe('rechazada');
    });
    
    it('should reject already processed transaction', async () => {
      const transactionId = '123e4567-e89b-12d3-a456-426614174002';
      const mockTransaction = {
        id: transactionId,
        estado: 'confirmada'
      };
      
      mockClient.query.mockResolvedValueOnce({ rows: [mockTransaction] });
      
      await expect(rejectTransaction(mockClient, transactionId)).rejects.toThrow('Transaction is not pending');
    });
  });
});

async function createTransaction(client: any, transactionData: any) {
  await client.query('BEGIN');
  
  try {
    const usersResult = await client.query(
      'SELECT id, saldo FROM users WHERE id IN ($1, $2) FOR UPDATE',
      [transactionData.origen, transactionData.destino]
    );
    
    if (usersResult.rows.length !== 2) {
      throw new Error('Origin or destination user not found');
    }
    
    const originUser = usersResult.rows.find((u: any) => u.id === transactionData.origen);
    if (originUser.saldo < transactionData.monto) {
      throw new Error('Insufficient funds');
    }
    
    const estado = transactionData.monto > 50000 ? 'pendiente' : 'confirmada';
    
    const transactionResult = await client.query(
      'INSERT INTO transactions (origen, destino, monto, estado) VALUES ($1, $2, $3, $4) RETURNING *',
      [transactionData.origen, transactionData.destino, transactionData.monto, estado]
    );
    
    const transaction = transactionResult.rows[0];
    
    await client.query(
      'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, description) VALUES ($1, $2, $3, $4, $5)',
      [transactionData.origen, transaction.id, 'transaction_created', transactionData.monto, `Transaction created - ${estado}`]
    );
    
    if (estado === 'confirmada') {
      const destUser = usersResult.rows.find((u: any) => u.id === transactionData.destino);
      
      await client.query(
        'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
        [transactionData.monto, transactionData.origen]
      );
      
      await client.query(
        'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
        [transactionData.monto, transactionData.destino]
      );
      
      await client.query(
        'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [transactionData.origen, transaction.id, 'debit', transactionData.monto, originUser.saldo, originUser.saldo - transactionData.monto, 'Transaction confirmed - debit']
      );
      
      await client.query(
        'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [transactionData.destino, transaction.id, 'credit', transactionData.monto, destUser.saldo, destUser.saldo + transactionData.monto, 'Transaction confirmed - credit']
      );
    }
    
    await client.query('COMMIT');
    return transaction;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function approveTransaction(client: any, transactionId: string) {
  await client.query('BEGIN');
  
  try {
    const transactionResult = await client.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    
    if (transactionResult.rows.length === 0) {
      throw new Error('Transaction not found');
    }
    
    const transaction = transactionResult.rows[0];
    
    if (transaction.estado !== 'pendiente') {
      throw new Error('Transaction is not pending');
    }
    
    const originUserResult = await client.query(
      'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
      [transaction.origen]
    );
    
    const originSaldo = parseFloat(originUserResult.rows[0].saldo);
    
    if (originSaldo < transaction.monto) {
      throw new Error('Insufficient funds');
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
    return updatedTransactionResult.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function rejectTransaction(client: any, transactionId: string) {
  const transactionResult = await client.query(
    'SELECT * FROM transactions WHERE id = $1',
    [transactionId]
  );
  
  if (transactionResult.rows.length === 0) {
    throw new Error('Transaction not found');
  }
  
  const transaction = transactionResult.rows[0];
  
  if (transaction.estado !== 'pendiente') {
    throw new Error('Transaction is not pending');
  }
  
  const updatedTransactionResult = await client.query(
    'UPDATE transactions SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
    ['rechazada', transactionId]
  );
  
  await client.query(
    'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, description) VALUES ($1, $2, $3, $4, $5)',
    [transaction.origen, transactionId, 'transaction_rejected', transaction.monto, 'Transaction rejected']
  );
  
  return updatedTransactionResult.rows[0];
}
