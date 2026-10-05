import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  const port = config.PORT;
  const host = '127.0.0.1';

  try {
    const address = await app.listen({ port, host });
    app.log.info(`API listening on ${address}`);
    console.log('Server successfully bound to:', address);
  } catch (err) {
    app.log.error(err);
    console.error('Listen error:', err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    try {
      if (app.redis) {
        await app.redis.quit().catch(() => {});
      }
      await app.close();
      await app.pgPool.end().catch(() => {});
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();