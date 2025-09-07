export default async function userRoutes(fastify, options) {
  fastify.get('/users', {
    schema: {
      description: 'Obtiene la lista de usuarios de la base de datos',
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  nombre: { type: 'string' },
                  email: { type: 'string' },
                  saldo: { type: 'number' },
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
      const result = await fastify.pg.query('SELECT * FROM users ORDER BY id');
      return { users: result.rows };
    } catch (error) {
      reply.code(500);
      return { error: 'Failed to fetch users', details: error.message };
    }
  });
}

