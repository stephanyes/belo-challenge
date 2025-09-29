import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth';
import { UnauthorizedError } from '../errors/AppError';

interface LoginRequest {
  email: string;
  password: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: LoginRequest;
    Reply: { token: string; user: { id: string; email: string; nombre: string } } | { error: string; message: string }
  }>('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    schema: {
      description: 'Autenticacion de usuario',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email'
          },
          password: {
            type: 'string',
            minLength: 6,
            maxLength: 100
          }
        }
      },
      response: {
        200: { $ref: 'AuthLoginResponse' },
        401: { $ref: 'ErrorResponse' }
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    try {
      const { email, password } = request.body;

      const userResult = await fastify.pg.query(
        'SELECT id, nombre, email, password, saldo FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedError('Invalid credentials: Email or password is incorrect');
      }

      const user = userResult.rows[0];

      // Verificar contraseña hasheada
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        throw new UnauthorizedError('Invalid credentials: Email or password is incorrect');
      }

      // Generar token JWT
      const token = generateToken({
        id: user.id,
        email: user.email,
        nombre: user.nombre
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre
        }
      };

    } catch (error) {
      throw error;
    }
  });

  fastify.get('/verify', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '5 minutes'
      }
    },
    schema: {
      description: 'Verificar si el token es valido',
      headers: {
        type: 'object',
        required: ['authorization'],
        properties: {
          authorization: {
            type: 'string',
            pattern: '^Bearer\\s+.+$'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                nombre: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      valid: true,
      user: (request as any).user
    };
  });
}
