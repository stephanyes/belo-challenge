export default async function generalRoutes(fastify, options) {
  fastify.get('/', {
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
  }, async (request, reply) => {
    return { message: 'Hello World! Server is running on port 3000' };
  });

  fastify.get('/health', {
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
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            database: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
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
      reply.code(500);
      return { 
        status: 'ERROR', 
        timestamp: new Date().toISOString(),
        database: 'Disconnected',
        error: error.message
      };
    }
  });
}

