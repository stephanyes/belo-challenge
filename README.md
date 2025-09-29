# Belo Challenge API

API REST desarrollada con Fastify y PostgreSQL.

## Índice

- [Setup](#setup)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Endpoints](#endpoints)
- [Health](#health)
- [Autenticacion](#autenticacion)
- [Base de datos](#base-de-datos)
- [Seguridad](#seguridad)
- [Validacion de Entrada](#validacion-de-entrada)
- [Paginación](#paginación)
- [Reglas de negocio](#reglas-de-negocio)
- [Implementación técnica](#implementación-técnica)
- [Datos de prueba](#datos-de-prueba)
- [Formato de errores](#formato-de-errores)
- [Logging](#logging)
- [API Docs (Swagger)](#api-docs-swagger)
- [Tests](#tests)

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

## Estructura del proyecto

```text
belo/
├─ src/
│  ├─ app.ts                 # Construcción de la app (plugins, rutas, handler de errores)
│  ├─ index.ts               # Entry point (levanta servidor)
│  ├─ bootstrap.ts           # Bootstrap compartido: schemas, plugins (CORS/Swagger/DB/rate-limit), rutas, error handler
│  ├─ config/
│  │  └─ config.ts           # Config de DB/Server a partir de env
│  ├─ errors/
│  │  └─ AppError.ts         # Errores custom y códigos estándar
│  ├─ middleware/
│  │  └─ auth.ts             # JWT: middleware y generateToken
│  ├─ routes/
│  │  ├─ general.ts          # Rutas públicas: '/', '/health'
│  │  ├─ auth.ts             # Login y verificación de token
│  │  ├─ users.ts            # Usuarios (con paginación y búsqueda)
│  │  ├─ transactions.ts     # Transacciones (CRUD parcial + aprobación/rechazo)
│  │  └─ audit.ts            # Auditoría (filtros + paginación)
│  ├─ scripts/
│  │  └─ seed.ts             # Seed de datos (bcrypt para passwords)
│  ├─ types/
│  │  └─ index.ts            # Tipos de dominio (User, Transaction, AuditLog)
│  └─ utils/
│     ├─ audit.ts            # Helper para insertar en audit_log
│     ├─ http.ts             # buildErrorResponse (formato estándar)
│     └─ pagination.ts       # Helpers de paginación
├─ test/
│  ├─ integration/
│  │  ├─ auth.e2e.test.ts    # E2E de login y rutas protegidas
│  │  └─ api.e2e.test.ts     # E2E de validación, paginación, rate limit
│  ├─ unit/                  # Tests unitarios
│  │  ├─ business-rules.test.ts
│  │  ├─ transaction-logic.test.ts
│  │  └─ validations.test.ts
│  └─ utils/
│     └─ audit.test.ts       # Tests de helper de auditoría
├─ init.sql                  # Esquema inicial (users, transactions, audit_log)
├─ docker-compose.yml        # PostgreSQL local
├─ jest.config.ts            # Config de Jest (ts-jest ESM)
├─ tsconfig.json             # Config de TypeScript
├─ package.json              # Scripts y dependencias
├─ env.example               # Variables de entorno de ejemplo
└─ README.md
```

## Endpoints


### **Rutas Generales (Publicas)**
- `GET /` - Endpoint principal
- `GET /health` - Estado del servidor y base de datos
- `GET /docs` - Documentación de la API (Swagger)

### **Autenticacion (Publicas)**
- `POST /login` - Autenticacion de usuario
  - **Body**: `{ "email": "string", "password": "string" }`
  - **Response**: `{ "token": "string", "user": { "id": "string", "email": "string", "nombre": "string" } }`
- `GET /verify` - Verificar si el token es valido (requiere autenticacion)

### **Usuarios (Protegidas)**
- `GET /users` - Lista todos los usuarios
  - **Headers**: `Authorization: Bearer <token>`

### **Transacciones (Protegidas)**
- `GET /transactions` - Lista todas las transacciones
- `GET /transactions?userId={uuid}` - Lista transacciones de un usuario específico
- `POST /transactions` - Crear nueva transacción
- `PATCH /transactions/{id}/approve` - Aprobar transacción pendiente
- `PATCH /transactions/{id}/reject` - Rechazar transacción pendiente
  - **Headers**: `Authorization: Bearer <token>` (requerido en todas)

### **Auditoria (Protegidas)**
- `GET /audit` - Lista logs de auditoría
- `GET /audit?userId={uuid}` - Logs de un usuario específico
- `GET /audit?transactionId={uuid}` - Logs de una transacción específica
- `GET /audit?operationType={type}` - Logs por tipo de operación
- `GET /audit?limit={number}&offset={number}` - Paginación de logs
  - **Headers**: `Authorization: Bearer <token>` (requerido en todas)

## Health

- `GET /health` verifica que la app este viva y que la base de datos responda.
- Ejecuta un query simple a PostgreSQL y devuelve `db_time` (latencia medida).
- Util para healthchecks externos (load balancer/monitoring).

## Autenticacion

### **Login**
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email": "juan@example.com", "password": "password123"}'
```

### **Usar Token**
```bash
curl -X GET http://localhost:3000/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### **Verificar Token**
```bash
curl -X GET http://localhost:3000/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### **Usuarios de Prueba**
- `juan@example.com` / `password123`
- `maria@example.com` / `password123`
- `carlos@example.com` / `password123`
- `ana@example.com` / `password123`
- `pedro@example.com` / `password123`
- `laura@example.com` / `password123`

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
- password (VARCHAR) - Contraseña hasheada con bcrypt
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

## Seguridad

### **Autenticacion JWT**
- **Tokens**: JWT con expiracion de 24 horas
- **Headers**: `Authorization: Bearer <token>` requerido en rutas protegidas
- **Rutas protegidas**: `/users`, `/transactions`, `/audit`
- **Rutas públicas**: `/`, `/health`, `/login`, `/docs`

### **Flag para deshabilitar autenticacion (Para que sea mas facil utilizar /docs)**
- **ENV**: `AUTH_FLAG`
- **Valores**:
  - `false`: desactiva la verificación de token, las rutas protegidas quedan públicas.
  - cualquier otro valor (o ausente): autenticación habilitada (por defecto).
- **Uso**:
  - Linux/macOS: `AUTH_FLAG=false npm run dev`
  - En `.env`: `AUTH_FLAG=false`

### **Hash de Contraseñas**
- **Algoritmo**: bcrypt con salt rounds: 10
- **Almacenamiento**: Contraseñas hasheadas en base de datos
- **Verificacion**: `bcrypt.compare()` en login

### **Rate Limiting**
- **Global**: Ventana `RATE_LIMIT_WINDOW_MS` (default 5m), maximo `RATE_LIMIT_MAX` (default 300), `RATE_LIMIT_BAN` (default 0)
- **Clave de limite**: por `userId` si hay JWT, si no por `IP`
- **Headers**: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`

**Limites por ruta:**
- `POST /login`: 5 por minuto
- `GET /users`, `GET /transactions`, `GET /audit`: 120 por 5 minutos
- `POST /transactions`: 30 por 5 minutos
- `PATCH /transactions/{id}/approve`, `PATCH /transactions/{id}/reject`: 20 por 5 minutos

### **Variables de Entorno**
```bash
# Agregar a .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=

PORT=3000
NODE_ENV=development

JWT_SECRET=your-super-secret-jwt-key-change-in-production
AUTH_FLAG=true

RATE_LIMIT_WINDOW_MS=300000
RATE_LIMIT_MAX=300
RATE_LIMIT_BAN=0
```

## Validacion de Entrada

Todas las rutas estan protegidas con validacion robusta usando JSON Schema nativo de Fastify:

### **Validaciones Implementadas:**
- **Email**: Formato valido requerido
- **Contraseñas**: 6-100 caracteres
- **UUIDs**: Formato valido para IDs
- **Montos**: Positivos, maximo 2 decimales
- **Paginacion**: Límites y offsets validos
- **Estados**: Valores permitidos (pendiente, confirmada, rechazada)

### **Mensajes de Error:**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body/email must match format \"email\""
}
```

## Paginación

Todas las rutas de listado soportan paginación completa:

### **Parámetros de Paginación:**
- **limit**: Número de elementos por página (1-100, default: 50)
- **offset**: Número de elementos a saltar (default: 0)
- **search**: Búsqueda por nombre o email (solo en usuarios)

### **Respuesta de Paginación:**
```json
{
  "data": [...],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "totalPages": 3,
    "currentPage": 1,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### **Ejemplos de Uso:**
```bash
# Primera página (10 elementos)
GET /users?limit=10&offset=0

# Segunda página
GET /users?limit=10&offset=10

# Búsqueda con paginación
GET /users?search=Juan&limit=5&offset=0

# Transacciones filtradas
GET /transactions?status=pendiente&limit=20&offset=0
```

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

## Formato de errores

Todas las respuestas de error siguen un formato estandar y consistente generado por el manejador global:

```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "body/email must match format \"email\"",
  "traceId": "req-1",
  "details": [
    {
      "instancePath": "/email",
      "message": "must match format \"email\""
    }
  ]
}
```

## Logging

- DEV: pino-pretty (colores y timestamps).
- PROD: JSON estructurado (compatible con agregadores de logs).
- Access logs por request: method, url, status, latencia (ms), `requestId`, `userId` (si aplica).
- Datos sensibles redactados: `Authorization`, `password`.
- Correlacion: usar `requestId`/`traceId` para enlazar requests y errores.

- traceId: id del request para correlacion de logs.

## API Docs (Swagger)

- UI: `GET /docs`
- JSON: `GET /docs/json`
- Autenticacion Bearer: usar el boton "Authorize" con el token de `POST /login`.
- Exportar especificacion:
  ```bash
  curl http://localhost:3000/docs/json > openapi.json
  ```
- details: NO incluido en produccion (NODE_ENV != production).

## Tests

- Comandos:
  - `npm test` (unit + integración)
  - `npm run test:watch`
  - `npm run test:coverage`
- Requisitos:
  - Base de datos en marcha (`docker-compose up -d`).
  - Datos de prueba opcionales con `npm run seed` para E2E que usan login.
  - Podes desactivar auth en desarrollo con `AUTH_FLAG=false`.

## Ejemplos de uso (curl)

### Usuarios
```bash
# Listar usuarios (requiere token)
curl -s "http://localhost:3000/users?limit=5&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq

# Búsqueda con paginación
curl -s "http://localhost:3000/users?search=Juan&limit=5&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq
```

### Transacciones
```bash
# Listar transacciones (todas o filtradas por estado)
curl -s "http://localhost:3000/transactions?status=pendiente&limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq

# Crear transacción (confirmada si monto <= 50000, sino pendiente)
curl -s -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
        "origen": "UUID_USUARIO_ORIGEN",
        "destino": "UUID_USUARIO_DESTINO",
        "monto": 1000
      }' | jq

# Aprobar transacción pendiente
curl -s -X PATCH http://localhost:3000/transactions/UUID_TX/approve \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq

# Rechazar transacción pendiente
curl -s -X PATCH http://localhost:3000/transactions/UUID_TX/reject \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq
```

### Auditoría
```bash
# Listar logs por usuario
curl -s "http://localhost:3000/audit?userId=UUID_USUARIO&limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq

# Listar logs por transacción
curl -s "http://localhost:3000/audit?transactionId=UUID_TX&limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq

# Listar logs por tipo de operación
curl -s "http://localhost:3000/audit?operationType=transaction_created&limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" | jq
```

### Health y Docs
```bash
# Health (200 si app y DB responden)
curl -s http://localhost:3000/health | jq

# OpenAPI JSON (para exportar)
curl -s http://localhost:3000/docs/json > openapi.json
```

### Ejemplos

Validacion (400):
```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "body/password must NOT have fewer than 6 characters",
  "traceId": "c0273605-4db8-4b89-89de-f35a31b14e1d"
}
```

No autorizado (401):
```json
{
  "statusCode": 401,
  "error": "UNAUTHORIZED",
  "message": "Invalid token: token is invalid or expired",
  "traceId": "fba8c109-bd0a-4a8b-bad9-86f78528d552"
}
```

Rate limit (429):
```json
{
  "statusCode": 429,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too Many Requests",
  "traceId": "f750544a-4ac5-47d9-90fc-594106304657"
}
```

Error interno (500):
```json
{
  "statusCode": 500,
  "error": "INTERNAL_ERROR",
  "message": "Internal Server Error",
  "traceId": "59a9a8b6-499d-46ca-be8f-3384bb38b848"
}
```
