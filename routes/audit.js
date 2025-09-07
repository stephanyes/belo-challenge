export default async function auditRoutes(fastify, options) {
  fastify.get('/audit', {
    schema: {
      description: 'Obtiene los logs de auditoria del sistema',
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          transactionId: { type: 'string', format: 'uuid' },
          operationType: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  user_id: { type: 'string', format: 'uuid' },
                  transaction_id: { type: 'string', format: 'uuid' },
                  operation_type: { type: 'string' },
                  amount: { type: 'number' },
                  previous_balance: { type: 'number' },
                  new_balance: { type: 'number' },
                  description: { type: 'string' },
                  created_at: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
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
      const { userId, transactionId, operationType, limit = 50, offset = 0 } = request.query;
      
      let query = 'SELECT * FROM audit_log';
      let countQuery = 'SELECT COUNT(*) as total FROM audit_log';
      let params = [];
      let paramCount = 0;
      const conditions = [];
      
      if (userId) {
        paramCount++;
        conditions.push(`user_id = $${paramCount}`);
        params.push(userId);
      }
      
      if (transactionId) {
        paramCount++;
        conditions.push(`transaction_id = $${paramCount}`);
        params.push(transactionId);
      }
      
      if (operationType) {
        paramCount++;
        conditions.push(`operation_type = $${paramCount}`);
        params.push(operationType);
      }
      
      if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
      }
      
      query += ' ORDER BY created_at DESC';
      query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);
      
      const countResult = await fastify.pg.query(countQuery, params.slice(0, paramCount));
      const total = parseInt(countResult.rows[0].total);
      
      const result = await fastify.pg.query(query, params);
      
      return {
        logs: result.rows,
        total,
        limit,
        offset
      };
    } catch (error) {
      reply.code(500);
      return { error: 'Failed to fetch audit logs', details: error.message };
    }
  });
}
