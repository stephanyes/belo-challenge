import 'dotenv/config';
import fastify, { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import Joi from 'joi';
import { registerCommonPluginsAndRoutes, registerCommonSchemas } from './bootstrap';

export async function buildApp(): Promise<FastifyInstance> {
  const isDev = process.env.NODE_ENV !== 'production';
  const appLogger: any = isDev
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', singleLine: false, ignore: 'pid,hostname' }
        },
        redact: ['req.headers.authorization', 'headers.authorization', 'password', 'body.password']
      }
    : { level: 'info', redact: ['req.headers.authorization', 'headers.authorization', 'password', 'body.password'] };

  const app: FastifyInstance = fastify({ logger: appLogger, disableRequestLogging: true, genReqId: () => randomUUID() });

  // Validate env
  const envSchema = Joi.object({
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().port().required(),
    DB_NAME: Joi.string().required(),
    DB_USER: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    PORT: Joi.number().port().default(3000),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(5 * 60 * 1000),
    RATE_LIMIT_MAX: Joi.number().integer().min(1).default(300),
    RATE_LIMIT_BAN: Joi.number().integer().min(0).default(0)
  });
  const { error } = envSchema.validate(process.env, { allowUnknown: true });
  if (error) throw new Error(`Env validation error: ${error.details[0].message}`);

  await registerCommonSchemas(app);
  await registerCommonPluginsAndRoutes(app);
  return app;
}


