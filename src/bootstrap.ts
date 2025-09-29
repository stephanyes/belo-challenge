import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import postgres from '@fastify/postgres';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import config from './config/config';
import { AppError, ConflictError, InternalServerError } from './errors/AppError';
import { buildErrorResponse } from './utils/http';

export async function registerCommonSchemas(app: FastifyInstance) {
  app.addSchema({ $id: 'ErrorResponse', type: 'object', properties: { statusCode: { type: 'integer' }, error: { type: 'string' }, message: { type: 'string' }, traceId: { type: 'string' }, details: { type: 'object' } } });
  app.addSchema({ $id: 'User', type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' }, email: { type: 'string' }, saldo: { type: 'number' }, created_at: { type: 'string' }, updated_at: { type: 'string' } } });
  app.addSchema({ $id: 'Transaction', type: 'object', properties: { id: { type: 'string' }, origen: { type: 'string' }, destino: { type: 'string' }, monto: { type: 'number' }, estado: { type: 'string' }, fecha: { type: 'string' }, created_at: { type: 'string' }, updated_at: { type: 'string' } } });
  app.addSchema({ $id: 'AuditLog', type: 'object', properties: { id: { type: 'string' }, user_id: { type: 'string' }, transaction_id: { type: 'string' }, operation_type: { type: 'string' }, amount: { type: 'number' }, previous_balance: { type: 'number' }, new_balance: { type: 'number' }, description: { type: 'string' }, created_at: { type: 'string' } } });
  app.addSchema({ $id: 'Pagination', type: 'object', properties: { total: { type: 'number' }, limit: { type: 'number' }, offset: { type: 'number' }, totalPages: { type: 'number' }, currentPage: { type: 'number' }, hasNext: { type: 'boolean' }, hasPrev: { type: 'boolean' } } });
  app.addSchema({ $id: 'UsersListResponse', type: 'object', properties: { data: { type: 'array', items: { $ref: 'User' } }, pagination: { $ref: 'Pagination' } } });
  app.addSchema({ $id: 'TransactionsListResponse', type: 'object', properties: { data: { type: 'array', items: { $ref: 'Transaction' } }, pagination: { $ref: 'Pagination' } } });
  app.addSchema({ $id: 'AuditListResponse', type: 'object', properties: { data: { type: 'array', items: { $ref: 'AuditLog' } }, pagination: { $ref: 'Pagination' } } });
  app.addSchema({ $id: 'AuthLoginResponse', type: 'object', properties: { token: { type: 'string' }, user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, nombre: { type: 'string' } } } } });
}

export async function registerCommonPluginsAndRoutes(app: FastifyInstance) {
  await app.register(cors, { origin: true, credentials: true });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Belo Challenge API', description: 'API para el challenge técnico de Belo', version: '1.0.0' },
      servers: [{ url: `http://localhost:${config.server.port}`, description: 'Servidor de desarrollo' }],
      components: {
        schemas: {
          ErrorResponse: { type: 'object', properties: { statusCode: { type: 'integer', example: 400 }, error: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string', example: 'body/email must match format "email"' }, traceId: { type: 'string', example: 'req-1' }, details: { type: 'object' } } }
        },
        securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Use Authorization: Bearer <token>' } }
      }
    }
  });
  await app.register(swaggerUI, { routePrefix: '/docs', uiConfig: { docExpansion: 'list', deepLinking: false } });

  await app.register(postgres, { connectionString: `postgres://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.database}` });

  await app.register(rateLimit, {
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    ban: Number(process.env.RATE_LIMIT_BAN) || 0,
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
    keyGenerator: (req) => ((req as any).user?.id ? `user:${(req as any).user.id}` : `ip:${req.ip}`)
  });

  // Access logs (omitir assets/docs static)
  app.addHook('onRequest', async (req) => { (req as any).startTimeNs = process.hrtime.bigint(); });
  app.addHook('onResponse', async (req, reply) => {
    const start = (req as any).startTimeNs as bigint | undefined;
    const durationMs = start ? Number(process.hrtime.bigint() - start) / 1_000_000 : undefined;
    const url = req.url || '';
    const isStaticDocs = url.startsWith('/docs/static');
    const isAsset = /\.(css|js|png|ico|svg)(\?.*)?$/i.test(url) || url === '/favicon.ico';
    if (isStaticDocs || isAsset) return;
    app.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, ms: durationMs ? Math.round(durationMs) : undefined, requestId: (req as any).id, userId: (req as any).user?.id }, 'access');
  });

  await app.register(import('./routes/general'));
  await app.register(import('./routes/auth'));
  await app.register(import('./routes/users'));
  await app.register(import('./routes/transactions'));
  await app.register(import('./routes/audit'));

  app.setErrorHandler((err, req, reply) => {
    if ((err as any).validation) {
      const payload = buildErrorResponse(req, 400, 'VALIDATION_ERROR', err.message || 'Validation error', (err as any).validation);
      return reply.status(400).send(payload);
    }
    if ((err as any).statusCode === 429) {
      const payload = buildErrorResponse(req, 429, 'RATE_LIMIT_EXCEEDED', err.message || 'Too Many Requests');
      return reply.status(429).send(payload);
    }
    if (err instanceof AppError) {
      const payload = buildErrorResponse(req, err.statusCode, err.errorCode, err.message, err.details);
      app.log.error({ err, traceId: (req as any).id }, err.message);
      return reply.status(err.statusCode).send(payload);
    }
    const pgCode = (err as any)?.code;
    if (pgCode === '23505') {
      const conflict = new ConflictError('Unique constraint violation');
      const payload = buildErrorResponse(req, conflict.statusCode, conflict.errorCode, conflict.message);
      app.log.error({ err, traceId: (req as any).id }, err.message);
      return reply.status(conflict.statusCode).send(payload);
    }
    const internal = new InternalServerError();
    const payload = buildErrorResponse(req, internal.statusCode, internal.errorCode, internal.message);
    app.log.error({ err, traceId: (req as any).id }, err.message);
    return reply.status(internal.statusCode).send(payload);
  });
}


