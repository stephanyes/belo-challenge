import { FastifyInstance } from 'fastify';

describe('General Routes Integration Tests', () => {
  let fastify: FastifyInstance;
  let mockQuery: jest.Mock;
  
  beforeAll(async () => {
    mockQuery = jest.fn();
    fastify = {
      pg: {
        query: mockQuery
      }
    } as any;
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('GET /', () => {
    it('should return welcome message', async () => {
      const result = await getRoot();
      
      expect(result.message).toBe('Welcome to Belo Challenge API');
      expect(result.version).toBe('1.0.0');
      expect(result.documentation).toBe('/docs');
    });
  });
  
  describe('GET /health', () => {
    it('should return health status when database is connected', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '1' }] });
      
      const result = await getHealth(fastify);
      
      expect(result.status).toBe('healthy');
      expect(result.database).toBe('connected');
      expect(result.timestamp).toBeDefined();
    });
    
    it('should return health status when database is disconnected', async () => {
      const error = new Error('Database connection failed');
      mockQuery.mockRejectedValue(error);
      
      const result = await getHealth(fastify);
      
      expect(result.status).toBe('unhealthy');
      expect(result.database).toBe('disconnected');
      expect(result.error).toBe('Database connection failed');
      expect(result.timestamp).toBeDefined();
    });
  });
});

async function getRoot() {
  return {
    message: 'Welcome to Belo Challenge API',
    version: '1.0.0',
    documentation: '/docs'
  };
}

async function getHealth(fastify: FastifyInstance) {
  try {
    await fastify.pg.query('SELECT 1 as count');
    
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    };
  }
}
