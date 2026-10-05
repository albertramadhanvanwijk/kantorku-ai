import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok' as const,
        version: '0.0.1',
        timestamp: new Date().toISOString(),
      },
    };
  });

  // Simple DB ping — does not expose internals
  app.get('/health/db', async (request, reply) => {
    try {
      const client = await app.pgPool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      return { success: true, data: { status: 'ok' as const } };
    } catch (err) {
      request.log.error({ err }, 'DB health check failed');
      return reply.status(503).send({
        success: false,
        error: { code: 'SYSTEM_ERROR', message: 'Database unavailable' },
      });
    }
  });

  app.get('/health/redis', async (request, reply) => {
    // Redis is optional in Phase 0 — report status without failing hard if not configured
    if (!app.redis) {
      return { success: true, data: { status: 'skipped', reason: 'Redis not configured' } };
    }
    try {
      await app.redis.ping();
      return { success: true, data: { status: 'ok' as const } };
    } catch (err) {
      request.log.error({ err }, 'Redis health check failed');
      return reply.status(503).send({
        success: false,
        error: { code: 'SYSTEM_ERROR', message: 'Redis unavailable' },
      });
    }
  });
}
