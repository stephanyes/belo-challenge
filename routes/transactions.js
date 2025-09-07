import { logAudit } from '../utils/audit.js';

export default async function transactionRoutes(fastify, options) {
  fastify.get('/transactions', {
    schema: {
      description: 'Obtiene transacciones filtradas por userId o todas las transacciones',
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  origen: { type: 'string', format: 'uuid' },
                  destino: { type: 'string', format: 'uuid' },
                  monto: { type: 'number' },
                  estado: { type: 'string' },
                  fecha: { type: 'string' },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' }
                }
              }
            }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.query;
      
      let query = 'SELECT * FROM transactions';
      let params = [];
      
      if (userId) {
        query += ' WHERE origen = $1 OR destino = $1';
        params = [userId];
      }
      
      query += ' ORDER BY fecha DESC';
      
      const result = await fastify.pg.query(query, params);
      return { transactions: result.rows };
    } catch (error) {
      reply.code(500);
      return { error: 'Failed to fetch transactions', details: error.message };
    }
  });

  fastify.patch('/transactions/:id/approve', {
    schema: {
      description: 'Confirma una transaccion pendiente y realiza el movimiento de fondos',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            transaction: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                origen: { type: 'string', format: 'uuid' },
                destino: { type: 'string', format: 'uuid' },
                monto: { type: 'number' },
                estado: { type: 'string' },
                fecha: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const client = await fastify.pg.connect();
    
    try {
      await client.query('BEGIN');
      
      const { id } = request.params;
      
      // Verificamos que la tx existe y esta pendiente
      const transactionResult = await client.query(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );
      
      if (transactionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { error: 'Transaction not found' };
      }
      
      const transaction = transactionResult.rows[0];
      
      if (transaction.estado !== 'pendiente') {
        await client.query('ROLLBACK');
        reply.code(400);
        return { error: 'Transaction is not pending' };
      }
      
      // Verificamos que el user origen tiene suficiente plata con LOCK
      const originUserResult = await client.query(
        'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
        [transaction.origen]
      );
      
      if (originUserResult.rows.length === 0) {
        await client.query('ROLLBACK');
        reply.code(400);
        return { error: 'Origin user not found' };
      }
      
      const originSaldo = parseFloat(originUserResult.rows[0].saldo);
      
      if (originSaldo < transaction.monto) {
        await client.query('ROLLBACK');
        reply.code(400);
        return { error: 'Insufficient funds' };
      }
      
      // Obtener saldo destino para auditoría
      const destUserResult = await client.query(
        'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
        [transaction.destino]
      );
      const destSaldo = parseFloat(destUserResult.rows[0].saldo);
      
      // Actualizamos saldos
      await client.query(
        'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
        [transaction.monto, transaction.origen]
      );
      
      await client.query(
        'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
        [transaction.monto, transaction.destino]
      );
      
      await logAudit(client, {
        userId: transaction.origen,
        transactionId: id,
        operationType: 'debit',
        amount: transaction.monto,
        previousBalance: originSaldo,
        newBalance: originSaldo - transaction.monto,
        description: `Transaction approved - debit for transaction ${id}`
      });
      
      await logAudit(client, {
        userId: transaction.destino,
        transactionId: id,
        operationType: 'credit',
        amount: transaction.monto,
        previousBalance: destSaldo,
        newBalance: destSaldo + transaction.monto,
        description: `Transaction approved - credit for transaction ${id}`
      });
      
      // Confirmamos la tx
      const updatedTransactionResult = await client.query(
        'UPDATE transactions SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        ['confirmada', id]
      );
      
      await client.query('COMMIT');
      
      return {
        message: 'Transaction approved successfully',
        transaction: updatedTransactionResult.rows[0]
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      reply.code(500);
      return { error: 'Failed to approve transaction', details: error.message };
    } finally {
      client.release();
    }
  });

  fastify.patch('/transactions/:id/reject', {
    schema: {
      description: 'Rechaza una transaccion pendiente sin modificar saldos',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            transaction: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                origen: { type: 'string', format: 'uuid' },
                destino: { type: 'string', format: 'uuid' },
                monto: { type: 'number' },
                estado: { type: 'string' },
                fecha: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Verificamos que la tx existe y esta pendiebte
      const transactionResult = await fastify.pg.query(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );
      
      if (transactionResult.rows.length === 0) {
        reply.code(404);
        return { error: 'Transaction not found' };
      }
      
      const transaction = transactionResult.rows[0];
      
      if (transaction.estado !== 'pendiente') {
        reply.code(400);
        return { error: 'Transaction is not pending' };
      }
      
      // Rechazamos la tx
      const updatedTransactionResult = await fastify.pg.query(
        'UPDATE transactions SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        ['rechazada', id]
      );
      
      await logAudit(fastify.pg, {
        userId: transaction.origen,
        transactionId: id,
        operationType: 'transaction_rejected',
        amount: transaction.monto,
        description: `Transaction rejected - transaction ${id}`
      });
      
      return {
        message: 'Transaction rejected successfully',
        transaction: updatedTransactionResult.rows[0]
      };
      
    } catch (error) {
      reply.code(500);
      return { error: 'Failed to reject transaction', details: error.message };
    }
  });

  fastify.post('/transactions', {
    schema: {
      description: 'Crea una transaccion entre dos usuarios',
      body: {
        type: 'object',
        properties: {
          origen: { type: 'string', format: 'uuid' },
          destino: { type: 'string', format: 'uuid' },
          monto: { type: 'number', minimum: 0.01 }
        },
        required: ['origen', 'destino', 'monto']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            transaction: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                origen: { type: 'string', format: 'uuid' },
                destino: { type: 'string', format: 'uuid' },
                monto: { type: 'number' },
                estado: { type: 'string' },
                fecha: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const client = await fastify.pg.connect();
    
    try {
      await client.query('BEGIN');
      
      const { origen, destino, monto } = request.body;
      
      // origen y destino deben existir con LOCK (FOR UPDATE)para concurrencia
      const usersResult = await client.query(
        'SELECT id, saldo FROM users WHERE id IN ($1, $2) FOR UPDATE',
        [origen, destino]
      );
      
      if (usersResult.rows.length !== 2) {
        await client.query('ROLLBACK');
        reply.code(400);
        return { error: 'Origin or destination user not found' };
      }
      
      // origen tiene suficiente plata?
      const originUser = usersResult.rows.find(u => u.id === origen);
      if (originUser.saldo < monto) {
        await client.query('ROLLBACK');
        reply.code(400);
        return { error: 'Insufficient funds' };
      }
      
      // determinamos el estado basado en el monto
      const estado = monto > 50000 ? 'pendiente' : 'confirmada';
      
      // Crear tx
      const transactionResult = await client.query(
        'INSERT INTO transactions (origen, destino, monto, estado) VALUES ($1, $2, $3, $4) RETURNING *',
        [origen, destino, monto, estado]
      );
      
      const transaction = transactionResult.rows[0];
      
      await logAudit(client, {
        userId: origen,
        transactionId: transaction.id,
        operationType: 'transaction_created',
        amount: monto,
        description: `Transaction created - ${estado} - to user ${destino}`
      });
      
      // Si es confirmada, actualizar saldos
      if (estado === 'confirmada') {
        const destUser = usersResult.rows.find(u => u.id === destino);
        const destSaldo = parseFloat(destUser.saldo);
        
        await client.query(
          'UPDATE users SET saldo = saldo - $1 WHERE id = $2',
          [monto, origen]
        );
        
        await client.query(
          'UPDATE users SET saldo = saldo + $1 WHERE id = $2',
          [monto, destino]
        );
        
        await logAudit(client, {
          userId: origen,
          transactionId: transaction.id,
          operationType: 'debit',
          amount: monto,
          previousBalance: originUser.saldo,
          newBalance: originUser.saldo - monto,
          description: `Transaction confirmed - debit for transaction ${transaction.id}`
        });
        
        await logAudit(client, {
          userId: destino,
          transactionId: transaction.id,
          operationType: 'credit',
          amount: monto,
          previousBalance: destSaldo,
          newBalance: destSaldo + monto,
          description: `Transaction confirmed - credit for transaction ${transaction.id}`
        });
      }
      
      await client.query('COMMIT');
      
      reply.code(201);
      return {
        message: estado === 'confirmada' ? 'Transaction created and confirmed' : 'Transaction created pending approval',
        transaction
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      reply.code(500);
      return { error: 'Failed to create transaction', details: error.message };
    } finally {
      client.release();
    }
  });
}

