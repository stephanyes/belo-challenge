import { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from '../errors/AppError';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    nombre: string;
  };
}

export const authMiddleware = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedError('Token required: Authorization header with Bearer token is required');

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    request.user = {
      id: decoded.id,
      email: decoded.email,
      nombre: decoded.nombre
    };

  } catch (error) {
    throw new UnauthorizedError('Invalid token: token is invalid or expired');
  }
};

export const generateToken = (user: { id: string; email: string; nombre: string }): string => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      nombre: user.nombre 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};