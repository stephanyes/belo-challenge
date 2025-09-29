import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { validatePaginationParams, calculatePagination, PaginationResult } from '../utils/pagination';
import { InternalServerError } from '../errors/AppError';

export default async function userRoutes(fastify: FastifyInstance) {
  const authDisabled = String(process.env.AUTH_FLAG).toLowerCase() === 'false';
  if (!authDisabled) {
    fastify.addHook('preHandler', authMiddleware);
  }

  fastify.get<{
    Querystring: { limit?: number; offset?: number; search?: string };
    Reply: PaginationResult<User> | { error: string; details: string }
  }>('/users', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      security: [{ BearerAuth: [] }],
      description: 'Obtiene la lista de usuarios de la base de datos',
      querystring: {
        type: 'object',
        properties: {
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
          search: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          }
        }
      },
      response: {
        200: { $ref: 'UsersListResponse' },
        401: { $ref: 'ErrorResponse' },
        429: { $ref: 'ErrorResponse' },
        500: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { limit?: number; offset?: number; search?: string } }>, reply: FastifyReply) => {
    try {
      const { limit, offset, search } = request.query;
      const { limit: validatedLimit, offset: validatedOffset } = validatePaginationParams(limit, offset);
      
      // Construir query con búsqueda opcional
      let query = 'SELECT * FROM users';
      let countQuery = 'SELECT COUNT(*) FROM users';
      const params: any[] = [];
      
      if (search) {
        query += ' WHERE nombre ILIKE $1 OR email ILIKE $1';
        countQuery += ' WHERE nombre ILIKE $1 OR email ILIKE $1';
        params.push(`%${search}%`);
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(validatedLimit, validatedOffset);
      
      // Ejecutar queries en paralelo
      const [usersResult, countResult] = await Promise.all([
        fastify.pg.query(query, params),
        fastify.pg.query(countQuery, search ? [params[0]] : [])
      ]);
      
      const total = parseInt(countResult.rows[0].count);
      const pagination = calculatePagination(total, validatedLimit, validatedOffset);
      
      return {
        data: usersResult.rows as User[],
        pagination
      };
    } catch (error) {
      throw new InternalServerError('Failed to fetch users');
    }
  });
}

