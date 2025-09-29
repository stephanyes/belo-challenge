export interface User {
  id: string;
  nombre: string;
  email: string;
  saldo: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  origen: string;
  destino: string;
  monto: number;
  estado: 'pendiente' | 'confirmada' | 'rechazada';
  fecha: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  transaction_id: string | null;
  operation_type: string;
  amount: number | null;
  previous_balance: number | null;
  new_balance: number | null;
  description: string | null;
  created_at: string;
}

export interface AuditData {
  userId: string;
  transactionId?: string | null;
  operationType: string;
  amount?: number | null;
  previousBalance?: number | null;
  newBalance?: number | null;
  description?: string | null;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
}

export interface AppConfig {
  database: DatabaseConfig;
  server: ServerConfig;
}

export interface CreateTransactionRequest {
  origen: string;
  destino: string;
  monto: number;
}

export interface TransactionResponse {
  transaction: Transaction;
  message: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export interface FastifyInstanceWithPg {
  pg: {
    query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
    connect: () => Promise<any>;
  };
}