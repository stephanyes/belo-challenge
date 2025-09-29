import 'dotenv/config';
import fastify, { FastifyInstance } from 'fastify';
import config from './config/config';
import { registerCommonPluginsAndRoutes, registerCommonSchemas } from './bootstrap';
import Joi from 'joi';
import { randomUUID } from 'crypto';


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

if (error) {
  console.error('Error en variables de entorno:', error.details[0].message);
  console.error('Copia env.example a .env y configura las variables');
  process.exit(1);
}

const isDev = process.env.NODE_ENV !== 'production';
const appLogger: any = isDev
  ? {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: false,
          ignore: 'pid,hostname'
        }
      },
      redact: ['req.headers.authorization', 'headers.authorization', 'password', 'body.password']
    }
  : {
      level: 'info',
      redact: ['req.headers.authorization', 'headers.authorization', 'password', 'body.password']
    };

const app: FastifyInstance = fastify({ 
  logger: appLogger,
  disableRequestLogging: true,
  genReqId: () => randomUUID()
});

const start = async () => {
  await registerCommonSchemas(app);
  await registerCommonPluginsAndRoutes(app);

  try {
    await app.listen({ port: Number(config.server.port), host: '0.0.0.0' });
    app.log.info(`Server running on port ${config.server.port}`);
    app.log.info(`API docs: http://localhost:${config.server.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();