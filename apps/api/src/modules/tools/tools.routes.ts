import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as shared from '@kantorku/shared';
import type { ToolRegistry } from './registry.js';

function getToolRegistry(app: FastifyInstance): ToolRegistry {
  const reg = (app as unknown as Record<string, unknown>)['toolRegistry'] as ToolRegistry | undefined;
  if (!reg) throw new shared.AppError('SYSTEM_ERROR', 'Tool registry not configured', 500);
  return reg;
}

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/tools — list registered tools
  app.get('/tools', { preHandler: [app.authenticate] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const registry = getToolRegistry(app);
    // Collect all registered tool definitions via getMany on all known names.
    // Registry has no list() so we use private handlers size via getMany probing.
    // Workaround: attempt to retrieve commonly registered tools; better: use registry internals.
    // We add a fallback that reads the internal map if available.
    const regAny = registry as unknown as { handlers?: Map<string, unknown>; listTools?: () => unknown[] };
    const defs: Array<{ name: string; description: string }> = [];

    if (regAny.handlers instanceof Map) {
      for (const handler of regAny.handlers.values()) {
        const h = handler as { definition?: { name: string; description: string } };
        if (h?.definition) defs.push({ name: h.definition.name, description: h.definition.description });
      }
    } else {
      // Fallback: try well-known tool names
      const known = ['web_search', 'fetch_url'];
      for (const name of known) {
        const defsForName = registry.getMany([name]);
        for (const d of defsForName) defs.push({ name: d.name, description: d.description });
      }
    }

    return reply.send({ success: true, data: defs });
  });
}
