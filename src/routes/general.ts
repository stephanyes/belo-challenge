import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InternalServerError } from '../errors/AppError';

export default async function generalRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Reply: { message: string }
  }>('/', {
    schema: {
      description: 'Endpoint principal de la API',
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { message: 'Hello World! Server is running on port 3000' };
  });

  fastify.get<{
    Reply: { 
      status: string; 
      timestamp: string; 
      database: string; 
      db_time?: string; 
      error?: string; 
    }
  }>('/health', {
    schema: {
      description: 'Verifica el estado del servidor y la conexión a la base de datos',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            database: { type: 'string' },
            db_time: { type: 'string' }
          }
        },
        500: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const client = await fastify.pg.connect();
      const result = await client.query('SELECT NOW() as current_time');
      client.release();
      
      return { 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: 'Connected',
        db_time: result.rows[0].current_time
      };
      } catch (error) {
        throw new InternalServerError('Health check failed');
      }
  });
}

