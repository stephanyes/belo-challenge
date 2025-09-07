import 'dotenv/config';
import fastify from 'fastify';
import config from './config/config.js';
import * as swagger from '@fastify/swagger';
import * as swaggerUI from '@fastify/swagger-ui';
import postgres from '@fastify/postgres';
import Joi from 'joi';

const envSchema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development')
});

const { error } = envSchema.validate(process.env, { allowUnknown: true });

if (error) {
  console.error('Error en variables de entorno:', error.details[0].message);
  console.error('Copia env.example a .env y configura las variables');
  process.exit(1);
}

const app = fastify({ logger: true });

const start = async () => {
  // SWAGGER
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Belo Challenge API',
        description: 'API para el challenge técnico de Belo',
        version: '1.0.0'
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Servidor de desarrollo'
        }
      ]
    }
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // POSTGRESQL
  await app.register(postgres, {
    connectionString: `postgres://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.database}`
  });

  // ROUTES
  await app.register(import('./routes/general.js'));
  await app.register(import('./routes/users.js'));
  await app.register(import('./routes/transactions.js'));
  await app.register(import('./routes/audit.js'));

  try {
    await app.listen({ port: config.server.port, host: '0.0.0.0' });
    console.log(`Server running on port ${config.server.port}`);
    console.log(`API docs: http://localhost:${config.server.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();