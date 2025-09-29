import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

describe('Auth & Protected Routes (E2E)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test('POST /login should return 200 with token for valid credentials', async () => {
    const res = await request(app.server)
      .post('/login')
      .send({ email: 'juan@example.com', password: 'password123' })
      .expect(200);

    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({ email: 'juan@example.com' });
  });

  test('POST /login should return 401 for invalid credentials', async () => {
    const res = await request(app.server)
      .post('/login')
      .send({ email: 'juan@example.com', password: 'wrongpass' })
      .expect(401);

    expect(res.body.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('GET /users should return 401 without token', async () => {
    const res = await request(app.server)
      .get('/users')
      .expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  test('GET /users should return 200 with valid token', async () => {
    const login = await request(app.server)
      .post('/login')
      .send({ email: 'juan@example.com', password: 'password123' })
      .expect(200);

    const token = login.body.token as string;
    const res = await request(app.server)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });
});


