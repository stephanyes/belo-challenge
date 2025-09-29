import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import config from '../config/config';

const pool = new Pool(config.database);

const seedData = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await client.query('DELETE FROM audit_log');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM users');
    
    const users = [
      { nombre: 'Juan Pérez', email: 'juan@example.com', password: 'password123', saldo: 100000.00 },
      { nombre: 'María García', email: 'maria@example.com', password: 'password123', saldo: 500000.00 },
      { nombre: 'Carlos López', email: 'carlos@example.com', password: 'password123', saldo: 60000.00 },
      { nombre: 'Ana Martínez', email: 'ana@example.com', password: 'password123', saldo: 30000.00 },
      { nombre: 'Pedro Rodríguez', email: 'pedro@example.com', password: 'password123', saldo: 0.00 },
      { nombre: 'Laura Sánchez', email: 'laura@example.com', password: 'password123', saldo: 0.00 }
    ];
    
    const userIds: string[] = [];
    for (const user of users) {
      // Hashear la contraseña
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      const result = await client.query(
        'INSERT INTO users (nombre, email, password, saldo) VALUES ($1, $2, $3, $4) RETURNING id',
        [user.nombre, user.email, hashedPassword, user.saldo]
      );
      userIds.push(result.rows[0].id);
    }
    
    const transactions = [
      { origen: userIds[0], destino: userIds[1], monto: 100.00, estado: 'confirmada' },
      { origen: userIds[1], destino: userIds[2], monto: 50.00, estado: 'pendiente' },
      { origen: userIds[2], destino: userIds[0], monto: 200.00, estado: 'confirmada' },
      { origen: userIds[3], destino: userIds[4], monto: 1000.00, estado: 'pendiente' }
    ];
    
    for (const tx of transactions) {
      await client.query(
        'INSERT INTO transactions (origen, destino, monto, estado) VALUES ($1, $2, $3, $4)',
        [tx.origen, tx.destino, tx.monto, tx.estado]
      );
    }
    
    // Insertar logs de ejemplo en audit_log
    const auditLogs = [
      {
        user_id: userIds[0],
        transaction_id: null,
        operation_type: 'transaction_created',
        amount: 100.00,
        previous_balance: 100000.00,
        new_balance: 100000.00,
        description: 'Initial balance setup'
      },
      {
        user_id: userIds[0],
        transaction_id: null,
        operation_type: 'debit',
        amount: 100.00,
        previous_balance: 100000.00,
        new_balance: 99900.00,
        description: 'Transaction confirmed - debit for transaction to María'
      },
      {
        user_id: userIds[1],
        transaction_id: null,
        operation_type: 'credit',
        amount: 100.00,
        previous_balance: 500000.00,
        new_balance: 500100.00,
        description: 'Transaction confirmed - credit for transaction from Juan'
      },
      {
        user_id: userIds[1],
        transaction_id: null,
        operation_type: 'transaction_created',
        amount: 50.00,
        previous_balance: 500100.00,
        new_balance: 500100.00,
        description: 'Transaction created - pending - to Carlos'
      },
      {
        user_id: userIds[2],
        transaction_id: null,
        operation_type: 'credit',
        amount: 200.00,
        previous_balance: 60000.00,
        new_balance: 60200.00,
        description: 'Transaction confirmed - credit for transaction from Carlos'
      },
      {
        user_id: userIds[3],
        transaction_id: null,
        operation_type: 'transaction_created',
        amount: 1000.00,
        previous_balance: 30000.00,
        new_balance: 30000.00,
        description: 'Transaction created - pending - to Pedro'
      }
    ];
    
    for (const log of auditLogs) {
      await client.query(
        'INSERT INTO audit_log (user_id, transaction_id, operation_type, amount, previous_balance, new_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [log.user_id, log.transaction_id, log.operation_type, log.amount, log.previous_balance, log.new_balance, log.description]
      );
    }
    
    await client.query('COMMIT');
    console.log('Seed data OK');
    console.log('6 Users added, 4 with balances 2 with zero balance');
    console.log('Transactions: 4 (2 confirmed, 2 pending)');
    console.log('Audit logs: 6 sample entries');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seedData();
