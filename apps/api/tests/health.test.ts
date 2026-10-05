import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

// Health routes do not require DB — we stub pool/redis to avoid needing Postgres in unit run.
// Full DB integration is verified via /health/db with a real DB in local dev.

describe('health routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    // Ensure env is set for buildApp
    process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/kantorku_ai';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-chars!!!!';
    process.env.AUTH_SECRET ??= 'test-auth-secret-min-32-chars!!!!';

    // Disable logger in tests to avoid pino-pretty issues
    app = await buildApp({ logger: false as any });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await Promise.race([app.close(), new Promise(r => setTimeout(r, 5000))]).catch(() => {});
    await Promise.race([app.pgPool.end(), new Promise(r => setTimeout(r, 5000))]).catch(() => {});
    if (app.redis) await Promise.race([app.redis.quit(), new Promise(r => setTimeout(r, 5000))]).catch(() => {});
  }, 20000);

  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('GET / returns api info', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('KantorKu-AI API');
  });

  it('GET /api/auth/me without token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
