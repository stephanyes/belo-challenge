import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logAudit } from '../utils/audit';
import { Transaction, User, CreateTransactionRequest, TransactionResponse, ErrorResponse } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validatePaginationParams, calculatePagination, PaginationResult } from '../utils/pagination';
import { BadRequestError, NotFoundError, InternalServerError } from '../errors/AppError';

interface TransactionQuery {
  userId?: string;
}

export default async function transactionRoutes(fastify: FastifyInstance) {
  const authDisabled = String(process.env.AUTH_FLAG).toLowerCase() === 'false';
  if (!authDisabled) {
    fastify.addHook('preHandler', authMiddleware);
  }
  fastify.get('/transactions', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Obtiene transacciones filtradas por userId o todas las transacciones',
      querystring: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            format: 'uuid'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 50
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0
          },
          startDate: {
            type: 'string',
            format: 'date-time'
          },
          endDate: {
            type: 'string',
            format: 'date-time'
          },
          status: {
            type: 'string',
            enum: ['pendiente', 'confirmada', 'rechazada']
          }
        }
      },
      response: {
        200: { $ref: 'TransactionsListResponse' },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { userId?: string; limit?: number; offset?: number; status?: string } }>, reply: FastifyReply) => {
    try {
      const { userId, limit, offset, status } = request.query;
      const { limit: validatedLimit, offset: validatedOffset } = validatePaginationParams(limit, offset);
      
      let query = 'SELECT * FROM transactions';
      let countQuery = 'SELECT COUNT(*) FROM transactions';
      const params: any[] = [];
      const whereConditions: string[] = [];
      
      if (userId) {
        whereConditions.push('(origen = $' + (params.length + 1) + ' OR destino = $' + (params.length + 1) + ')');
        params.push(userId);
      }
      
      if (status) {
        whereConditions.push('estado = $' + (params.length + 1));
        params.push(status);
      }
      
      if (whereConditions.length > 0) {
        const whereClause = ' WHERE ' + whereConditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
      }
      
      query += ' ORDER BY fecha DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(validatedLimit, validatedOffset);
      
      const [transactionsResult, countResult] = await Promise.all([
        fastify.pg.query(query, params),
        fastify.pg.query(countQuery, params.slice(0, -2)) // Excluir limit y offset del count
      ]);
      
      const total = parseInt(countResult.rows[0].count);
      const pagination = calculatePagination(total, validatedLimit, validatedOffset);
      
      return {
        data: transactionsResult.rows as Transaction[],
        pagination
      };
    } catch (error) {
      throw new InternalServerError('Failed to fetch transactions');
    }
  });

  fastify.patch('/transactions/:id/approve', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Confirma una transaccion pendiente y realiza el movimiento de fondos',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          }
        }
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
        400: { $ref: 'ErrorResponse' },
        401: { $ref: 'ErrorResponse' },
        429: { $ref: 'ErrorResponse' },
        404: { $ref: 'ErrorResponse' },
        500: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
        throw new NotFoundError('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      
      if (transaction.estado !== 'pendiente') {
        await client.query('ROLLBACK');
        throw new BadRequestError('Transaction is not pending');
      }
      
      // Verificamos que el user origen tiene suficiente plata con LOCK
      const originUserResult = await client.query(
        'SELECT saldo FROM users WHERE id = $1 FOR UPDATE',
        [transaction.origen]
      );
      
      if (originUserResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new BadRequestError('Origin user not found');
      }
      
      const originSaldo = parseFloat(originUserResult.rows[0].saldo);
      
      if (originSaldo < transaction.monto) {
        await client.query('ROLLBACK');
        throw new BadRequestError('Insufficient funds');
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
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.patch('/transactions/:id/reject', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Rechaza una transaccion pendiente sin modificar saldos',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          }
        }
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
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      // Verificamos que la tx existe y esta pendiebte
      const transactionResult = await fastify.pg.query(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );
      
      if (transactionResult.rows.length === 0) {
        throw new NotFoundError('Transaction not found');
      }
      
      const transaction = transactionResult.rows[0];
      
      if (transaction.estado !== 'pendiente') {
        throw new BadRequestError('Transaction is not pending');
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
      throw error;
    }
  });

  fastify.post('/transactions', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Crea una transaccion entre dos usuarios',
      body: {
        type: 'object',
        required: ['origen', 'destino', 'monto'],
        properties: {
          origen: {
            type: 'string',
            format: 'uuid'
          },
          destino: {
            type: 'string',
            format: 'uuid'
          },
          monto: {
            type: 'number',
            minimum: 0.01,
            maximum: 999999999.99,
            multipleOf: 0.01
          }
        }
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
        400: { $ref: 'ErrorResponse' },
        401: { $ref: 'ErrorResponse' },
        429: { $ref: 'ErrorResponse' },
        500: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateTransactionRequest }>, reply: FastifyReply) => {
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
        throw new BadRequestError('Origin or destination user not found');
      }
      
      // origen tiene suficiente plata?
      const originUser = usersResult.rows.find((u: User) => u.id === origen);
      if (originUser.saldo < monto) {
        await client.query('ROLLBACK');
        throw new BadRequestError('Insufficient funds');
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
        const destUser = usersResult.rows.find((u: User) => u.id === destino);
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
      throw error;
    } finally {
      client.release();
    }
  });
}

