import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuditLog } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validatePaginationParams, calculatePagination, PaginationResult } from '../utils/pagination';
import { InternalServerError } from '../errors/AppError';

interface AuditQuery {
  userId?: string;
  transactionId?: string;
  operationType?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export default async function auditRoutes(fastify: FastifyInstance) {
  const authDisabled = String(process.env.AUTH_FLAG).toLowerCase() === 'false';
  if (!authDisabled) {
    fastify.addHook('preHandler', authMiddleware);
  }
  fastify.get('/audit', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Obtiene los logs de auditoria del sistema',
      querystring: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            format: 'uuid'
          },
          transactionId: {
            type: 'string',
            format: 'uuid'
          },
          operationType: {
            type: 'string',
            enum: ['debit', 'credit', 'transaction_created', 'transaction_approved', 'transaction_rejected']
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
          }
        }
      },
      response: {
        200: { $ref: 'AuditListResponse' },
        401: { $ref: 'ErrorResponse' },
        429: { $ref: 'ErrorResponse' },
        500: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: AuditQuery }>, reply: FastifyReply) => {
    try {
      const { userId, transactionId, operationType, limit, offset, startDate, endDate } = request.query;
      const { limit: validatedLimit, offset: validatedOffset } = validatePaginationParams(limit, offset);
      
      let query = 'SELECT * FROM audit_log';
      let countQuery = 'SELECT COUNT(*) FROM audit_log';
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (userId) {
        conditions.push('user_id = $' + (params.length + 1));
        params.push(userId);
      }
      
      if (transactionId) {
        conditions.push('transaction_id = $' + (params.length + 1));
        params.push(transactionId);
      }
      
      if (operationType) {
        conditions.push('operation_type = $' + (params.length + 1));
        params.push(operationType);
      }
      
      if (startDate) {
        conditions.push('created_at >= $' + (params.length + 1));
        params.push(startDate);
      }
      
      if (endDate) {
        conditions.push('created_at <= $' + (params.length + 1));
        params.push(endDate);
      }
      
      if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(validatedLimit, validatedOffset);
      
      const [logsResult, countResult] = await Promise.all([
        fastify.pg.query(query, params),
        fastify.pg.query(countQuery, params.slice(0, -2))
      ]);
      
      const total = parseInt(countResult.rows[0].count);
      const pagination = calculatePagination(total, validatedLimit, validatedOffset);
      
      return {
        data: logsResult.rows as AuditLog[],
        pagination
      };
    } catch (error) {
      throw new InternalServerError('Failed to fetch audit logs');
    }
  });
}
