import { AppConfig } from '../types';

const config: AppConfig = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'belo_db',
    user: process.env.DB_USER || 'belo_user',
    password: process.env.DB_PASSWORD || 'belo_password',
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  }
};

export default config;
