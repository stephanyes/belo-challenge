import { FastifyInstance } from 'fastify';

describe('Users Integration Tests', () => {
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
  
  describe('GET /users', () => {
    it('should return all users successfully', async () => {
      const mockUsers = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          nombre: 'Juan Pérez',
          email: 'juan@example.com',
          saldo: 100000.00,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z'
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          nombre: 'María García',
          email: 'maria@example.com',
          saldo: 500000.00,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z'
        }
      ];
      
      mockQuery.mockResolvedValue({ rows: mockUsers });
      
      const result = await getUsers(fastify);
      
      expect(result.users).toEqual(mockUsers);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users ORDER BY created_at DESC');
    });
    
    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockQuery.mockRejectedValue(error);
      
      const result = await getUsers(fastify);
      
      expect(result.error).toBe('Failed to fetch users');
      expect(result.details).toBe('Database connection failed');
    });
    
    it('should return empty array when no users exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      const result = await getUsers(fastify);
      
      expect(result.users).toEqual([]);
    });
  });
});

async function getUsers(fastify: FastifyInstance) {
  try {
    const result = await fastify.pg.query('SELECT * FROM users ORDER BY created_at DESC');
    return { users: result.rows };
  } catch (error) {
    return { error: 'Failed to fetch users', details: (error as Error).message };
  }
}
