CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    saldo DECIMAL(15,2) DEFAULT 0.00 CHECK (saldo >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origen UUID NOT NULL REFERENCES users(id),
    destino UUID NOT NULL REFERENCES users(id),
    monto DECIMAL(15,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'rechazada')),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (nombre, email, saldo) VALUES 
    ('Juan Pérez', 'juan@example.com', 1000.00),
    ('María García', 'maria@example.com', 500.00),
    ('Carlos López', 'carlos@example.com', 750.00),
    ('Ana Martínez', 'ana@example.com', 2500.00),
    ('Pedro Rodríguez', 'pedro@example.com', 0.00),
    ('Laura Sánchez', 'laura@example.com', 0.00)
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    transaction_id UUID REFERENCES transactions(id),
    operation_type VARCHAR(20) NOT NULL, -- 'debit', 'credit', 'transaction_created', 'transaction_approved', 'transaction_rejected'
    amount DECIMAL(15,2),
    previous_balance DECIMAL(15,2),
    new_balance DECIMAL(15,2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_transactions_origen ON transactions(origen);
CREATE INDEX IF NOT EXISTS idx_transactions_destino ON transactions(destino);
CREATE INDEX IF NOT EXISTS idx_transactions_estado ON transactions(estado);
CREATE INDEX IF NOT EXISTS idx_transactions_fecha ON transactions(fecha);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_transaction_id ON audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
