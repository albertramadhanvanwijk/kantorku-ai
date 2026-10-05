import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { AppError, toErrorEnvelope } from '@kantorku/shared';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { getPool } from './db/connection.js';
import authPlugin from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';

export async function buildApp(opts: { logger?: ReturnType<typeof createLogger> | false } = {}) {
  const config = loadConfig();
  const logger = opts.logger === false ? false : (opts.logger ?? createLogger(config.LOG_LEVEL));

  const app = Fastify({
    logger,
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  });

  // Decorate config + infra for route handlers
  app.decorate('config', config);
  const pgPool = getPool(config.DATABASE_URL);
  app.decorate('pgPool', pgPool);

  // Redis is optional in Phase 0 — best-effort connect, do not crash if unavailable
  let redis: any = null;
  const log = logger || { warn: () => {}, info: () => {}, error: () => {} };
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: config.REDIS_URL });
    client.on('error', (err: Error) => log.warn({ err }, 'Redis error'));
    // Add timeout to prevent hanging in tests/CI when Redis is unavailable
    const connectPromise = client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
    );
    await Promise.race([connectPromise, timeoutPromise]).catch((err: Error) => {
      log.warn({ err }, 'Redis connect failed or timed out — continuing without Redis');
      return null;
    });
    if (client.isOpen) {
      redis = client;
      log.info('Redis connected');
    }
  } catch (err) {
    log.warn({ err }, 'Redis not available — continuing without cache/queue');
  }
  app.decorate('redis', redis);

  // Lightweight db helper for services (drizzle wrapper)
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const db = drizzle(pgPool);
  app.decorate('db', db);

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  await app.register(authPlugin);

  // Global error handler — consistent envelope per DEVELOPMENT-RULES.md
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, error.message);
      return reply.status(error.statusCode).send(toErrorEnvelope(error));
    }

    if ((error as any).validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: (error as any).message ?? 'Validation failed',
          details: (error as any).validation,
        },
      });
    }

    // Fastify JWT errors
    if ((error as any).statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: (error as any).message ?? 'Unauthorized' },
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    const statusCode = (error as any).statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'SYSTEM_ERROR',
        message: config.NODE_ENV === 'production' ? 'Internal server error' : (error as Error).message,
      },
    });
  });

  // Routes
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
    },
    { prefix: '/api' },
  );

  // Root — helpful for manual checks
  app.get('/', async () => ({
    success: true,
    data: { name: 'KantorKu-AI API', version: '0.0.1', docs: '/api/health' },
  }));

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ReturnType<typeof loadConfig>;
    pgPool: ReturnType<typeof getPool>;
    redis: any;
    db: any;
  }
}
