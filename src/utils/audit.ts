import { PoolClient } from 'pg';
import { AuditData } from '../types';

export async function logAudit(
  client: PoolClient | any, 
  {
    userId,
    transactionId = null,
    operationType,
    amount = null,
    previousBalance = null,
    newBalance = null,
    description = null
  }: AuditData
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, transactionId, operationType, amount, previousBalance, newBalance, description]
  );
}