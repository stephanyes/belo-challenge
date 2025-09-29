import { logAudit } from '../../src/utils/audit';

describe('Audit Utils', () => {
  let mockClient: any;
  
  beforeEach(() => {
    mockClient = {
      query: jest.fn()
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('logAudit', () => {
    it('should insert audit record with all required fields', async () => {
      const auditData = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        transactionId: '123e4567-e89b-12d3-a456-426614174001',
        operationType: 'debit',
        amount: 100.50,
        previousBalance: 1000.00,
        newBalance: 899.50,
        description: 'Test transaction'
      };
      
      mockClient.query.mockResolvedValue({ rows: [] });
      
      await logAudit(mockClient, auditData);
      
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          auditData.userId,
          auditData.transactionId,
          auditData.operationType,
          auditData.amount,
          auditData.previousBalance,
          auditData.newBalance,
          auditData.description
        ])
      );
    });
    
    it('should handle optional parameters', async () => {
      const auditData = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        operationType: 'transaction_created'
      };
      
      mockClient.query.mockResolvedValue({ rows: [] });
      
      await logAudit(mockClient, auditData);
      
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          auditData.userId,
          null, // transactionId
          auditData.operationType,
          null, // amount
          null, // previousBalance
          null, // newBalance
          null  // description
        ])
      );
    });
    
    it('should handle database errors', async () => {
      const auditData = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        operationType: 'debit'
      };
      
      const dbError = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(dbError);
      
      await expect(logAudit(mockClient, auditData)).rejects.toThrow('Database connection failed');
    });
  });
});