import 'dotenv/config';
import { Pool } from 'pg';
import config from '../config.js';

const pool = new Pool(config.database);

const seedData = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await client.query('DELETE FROM audit_log');
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM users');
    
    const users = [
      { nombre: 'Juan Pérez', email: 'juan@example.com', saldo: 100000.00 },
      { nombre: 'María García', email: 'maria@example.com', saldo: 500000.00 },
      { nombre: 'Carlos López', email: 'carlos@example.com', saldo: 60000.00 },
      { nombre: 'Ana Martínez', email: 'ana@example.com', saldo: 30000.00 },
      { nombre: 'Pedro Rodríguez', email: 'pedro@example.com', saldo: 0.00 },
      { nombre: 'Laura Sánchez', email: 'laura@example.com', saldo: 0.00 }
    ];
    
    const userIds = [];
    for (const user of users) {
      const result = await client.query(
        'INSERT INTO users (nombre, email, saldo) VALUES ($1, $2, $3) RETURNING id',
        [user.nombre, user.email, user.saldo]
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
    
    await client.query('COMMIT');
    console.log('Seed data OK');
    console.log('6 Users added, 4 with balances 2 with zero balance');
    console.log('Transactions: 4 (2 confirmed, 2 pending)');
    
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
