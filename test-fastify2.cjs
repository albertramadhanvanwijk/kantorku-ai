const Fastify = require('fastify');

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  success: true,
  data: { status: 'ok', timestamp: new Date().toISOString() }
}));

async function main() {
  try {
    const address = await app.listen({ port: 4000, host: '127.0.0.1' });
    console.log('Fastify server listening on:', address);
  } catch (err) {
    console.error('Listen error:', err);
    process.exit(1);
  }
}

main();