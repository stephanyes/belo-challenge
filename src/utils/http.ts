import { FastifyRequest } from 'fastify';

export function buildErrorResponse(
  req: FastifyRequest,
  statusCode: number,
  errorCode: string,
  message: string,
  details?: unknown
) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    statusCode,
    error: errorCode,
    message,
    traceId: (req as any).id,
    ...(details && !isProd ? { details } : {})
  };
}

