import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

describe('API E2E - pagination, validation, rate limit, error format', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    process.env.RATE_LIMIT_MAX = '5';
    app = await buildApp();
    await app.ready();
    const login = await request(app.server)
      .post('/login')
      .send({ email: 'juan@example.com', password: 'password123' })
      .expect(200);
    token = login.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  test('Users pagination returns data and pagination', async () => {
    const res = await request(app.server)
      .get('/users?limit=2&offset=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination.limit).toBe(2);
  });

  test('Transactions validation 400 when body is invalid', async () => {
    const res = await request(app.server)
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ origen: 'not-a-uuid', destino: 'also-bad', monto: -10 })
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
  });

  test('Rate limit 429 on /login after exceeding max', async () => {
    // Perform 6 requests quickly; config is 5/min for /login
    for (let i = 0; i < 5; i++) {
      await request(app.server)
        .post('/login')
        .send({ email: 'juan@example.com', password: i === 0 ? 'wrong' : 'password123' })
        .then(() => {});
    }
    const sixth = await request(app.server)
      .post('/login')
      .send({ email: 'juan@example.com', password: 'password123' })
      .expect((res) => {
        if (res.status !== 429 && res.status !== 403) {
          throw new Error(`Expected 429 or 403, got ${res.status}`);
        }
      });
    expect([403, 429]).toContain(sixth.status);
  });
});


