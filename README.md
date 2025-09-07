# Belo Challenge API

API REST desarrollada con Fastify y PostgreSQL.

## Setup

1. **Configurar variables de entorno:**
   ```bash
   cp env.example .env
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Levantar base de datos:**
   ```bash
   docker-compose up -d
   ```

4. **Arrancar servidor:**
   ```bash
   npm start
   ```

5. **Poblar con datos de prueba (opcional):**
   ```bash
   npm run seed
   ```

## Endpoints

### **Rutas Generales**
- `GET /` - Endpoint principal
- `GET /health` - Estado del servidor y base de datos
- `GET /docs` - Documentación de la API (Swagger)

### **Usuarios**
- `GET /users` - Lista todos los usuarios

### **Transacciones**
- `GET /transactions` - Lista todas las transacciones
- `GET /transactions?userId={uuid}` - Lista transacciones de un usuario específico
- `POST /transactions` - Crear nueva transacción
- `PATCH /transactions/{id}/approve` - Aprobar transacción pendiente
- `PATCH /transactions/{id}/reject` - Rechazar transacción pendiente

### **Auditoría**
- `GET /audit` - Lista logs de auditoría
- `GET /audit?userId={uuid}` - Logs de un usuario específico
- `GET /audit?transactionId={uuid}` - Logs de una transacción específica
- `GET /audit?operationType={type}` - Logs por tipo de operación
- `GET /audit?limit={number}&offset={number}` - Paginación de logs

## Base de datos

PostgreSQL 16 en Docker:
- Host: localhost:5432
- Database: belo_db
- User: belo_user
- Password: belo_password

### Modelos

**Users:**
- id (UUID PRIMARY KEY)
- nombre (VARCHAR)
- email (VARCHAR UNIQUE)
- saldo (DECIMAL)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**Transactions:**
- id (UUID PRIMARY KEY)
- origen (UUID, FK a users)
- destino (UUID, FK a users)
- monto (DECIMAL)
- estado (pendiente, confirmada, rechazada)
- fecha (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**Audit Log:**
- id (UUID PRIMARY KEY)
- user_id (UUID, FK a users)
- transaction_id (UUID, FK a transactions, nullable)
- operation_type (VARCHAR)
- amount (DECIMAL, nullable)
- previous_balance (DECIMAL, nullable)
- new_balance (DECIMAL, nullable)
- description (TEXT, nullable)
- created_at (TIMESTAMP)

## Reglas de negocio

- Ningún usuario puede tener saldo negativo
- Las transacciones deben ser ATOMICAS, si falla el débito o crédito no debe quedar en estado parcial
- No se pueden generar dos transacciones simultáneas del mismo origen por más de su saldo disponible (concurrente)
- Debe quedar un registro claro de cada operación y su efecto sobre el saldo

## Implementación técnica

### Atomicidad con PostgreSQL
- **Transacciones DB**: Todas las operaciones usan `BEGIN/COMMIT/ROLLBACK`
- **Rollback automático**: Si falla cualquier validación o operación, toda la transacción se revierte
- **Ejemplo**: Si falla el crédito al destino, el débito al origen también se revierte

### Control de concurrencia
- **Row-level locks**: `FOR UPDATE` en consultas de usuarios previene transacciones simultáneas
- **Previene**: Que dos transacciones del mismo usuario excedan su saldo disponible
- **Bloqueo**: PostgreSQL maneja automáticamente los locks durante la transacción

### Auditoría completa
- **Tabla audit_log**: Registra cada operación con saldo anterior y nuevo
- **Tipos de operación**: `debit`, `credit`, `transaction_created`, `transaction_approved`, `transaction_rejected`
- **Trazabilidad**: Cada cambio de saldo queda registrado con timestamp y descripción

### Validaciones de integridad
- **Constraint DB**: `CHECK (saldo >= 0)` previene saldos negativos a nivel de base de datos
- **Validación previa**: Verificación de fondos antes de cualquier operación
- **Doble verificación**: Validación en aplicación + constraint en DB

## Datos de prueba

El script `npm run seed` crea:

### Usuarios (6 total):
- **Juan Pérez** - $100,000.00
- **María García** - $500,000.00  
- **Carlos López** - $60,000.00
- **Ana Martínez** - $30,000.00
- **Pedro Rodríguez** - $0.00
- **Laura Sánchez** - $0.00

### Transacciones (4 total):
- Juan → María: $100 (confirmada)
- María → Carlos: $50 (pendiente)
- Carlos → Juan: $200 (confirmada)
- Ana → Pedro: $1,000 (pendiente)

**Nota**: El seed limpia todos los datos existentes y resetea las secuencias.
