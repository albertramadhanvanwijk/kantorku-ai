import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { AgentDefinition } from './types.js';
import type { AgentRegistry } from './registry.js';
import type { AgentService } from './agent.service.js';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  slug: z.string().optional(),
  version: z.string().optional(),
});

const createAgentBodySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  purpose: z.string().min(1),
  allowedTools: z.array(z.string()).default([]),
  systemPrompt: z.string().min(1),
  promptVersion: z.string().min(1),
  modelPolicy: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  // inputSchema/outputSchema are optional JSON; if missing we use passthrough object schemas
  inputSchema: z.unknown().optional(),
  outputSchema: z.unknown().optional(),
});

const runAgentBodySchema = z.object({
  input: z.unknown(),
  correlationId: z.string().optional(),
});

function serializeAgent(def: AgentDefinition): Record<string, unknown> {
  return {
    id: def.id,
    slug: def.id,
    name: def.name,
    version: def.version,
    role: def.role,
    purpose: def.purpose,
    allowedTools: def.allowedTools,
    systemPrompt: def.systemPrompt,
    promptVersion: def.promptVersion,
    modelPolicy: def.modelPolicy,
    config: def.config,
  };
}

function getAgentRegistry(app: FastifyInstance): AgentRegistry {
  const reg = (app as unknown as Record<string, unknown>)['agentRegistry'] as AgentRegistry | undefined;
  if (!reg) throw new shared.AppError('SYSTEM_ERROR', 'Agent registry not configured', 500);
  return reg;
}

function getAgentService(app: FastifyInstance): AgentService {
  const svc = (app as unknown as Record<string, unknown>)['agentService'] as AgentService | undefined;
  if (!svc) throw new shared.AppError('SYSTEM_ERROR', 'Agent service not configured', 500);
  return svc;
}

export async function agentsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/agents — list
  app.get('/agents', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = paginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const { slug, version, page, pageSize } = parsed.data;
    const registry = getAgentRegistry(app);
    let defs: AgentDefinition[] = registry.list();

    if (slug) {
      defs = defs.filter((d) => d.id === slug);
      // If version also specified, try exact fetch
      if (version) {
        const exact = registry.get(slug, version);
        defs = exact ? [exact] : [];
      }
    } else if (version) {
      defs = defs.filter((d) => d.version === version);
    }

    // Pagination (in-memory)
    const p = page ?? 1;
    const ps = pageSize ?? 20;
    const total = defs.length;
    const start = (p - 1) * ps;
    const paged = defs.slice(start, start + ps).map(serializeAgent);

    return reply.send({
      success: true,
      data: paged,
      meta: { total, page: p, pageSize: ps },
    });
  });

  // POST /api/agents — register
  app.post('/agents', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createAgentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid input', { issues: parsed.error.issues });
    }
    const body = parsed.data;
    const registry = getAgentRegistry(app);

    // Check conflict
    const existing = registry.get(body.slug, body.version);
    if (existing) {
      throw shared.conflict(`Agent already exists: ${body.slug}@${body.version}`);
    }

    // Build Zod schemas for runtime: if inputSchema/outputSchema provided as JSON, we treat as passthrough;
    // otherwise use generic passthrough object.
    const inputSchema = z.object({}).passthrough();
    const outputSchema = z.object({}).passthrough();

    const def: AgentDefinition = {
      id: body.slug,
      name: body.name,
      version: body.version,
      role: body.role,
      purpose: body.purpose,
      inputSchema: (body.inputSchema as unknown as z.ZodTypeAny) ?? inputSchema,
      outputSchema: (body.outputSchema as unknown as z.ZodTypeAny) ?? outputSchema,
      allowedTools: body.allowedTools,
      systemPrompt: body.systemPrompt,
      promptVersion: body.promptVersion,
      modelPolicy: body.modelPolicy,
      config: (body.config as Record<string, unknown>) ?? {},
    };

    // Ensure ZodType fallbacks when body schemas are not Zod instances
    if (!def.inputSchema || typeof (def.inputSchema as unknown as { parse?: unknown }).parse !== 'function') {
      def.inputSchema = inputSchema;
    }
    if (!def.outputSchema || typeof (def.outputSchema as unknown as { parse?: unknown }).parse !== 'function') {
      def.outputSchema = outputSchema;
    }

    registry.register(def);

    return reply.status(201).send({
      success: true,
      data: serializeAgent(def),
    });
  });

  // GET /api/agents/:id
  app.get('/agents/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing agent id');
    const registry = getAgentRegistry(app);
    const def = registry.get(id);
    if (!def) {
      throw shared.notFound(`Agent not found: ${id}`);
    }
    return reply.send({ success: true, data: serializeAgent(def) });
  });

  // POST /api/agents/:id/run
  app.post('/agents/:id/run', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = runAgentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid input', { issues: parsed.error.issues });
    }
    // Enforce that body has input field explicitly present (Zod would allow undefined due to unknown())
    const rawBody = request.body as Record<string, unknown> | null | undefined;
    if (!rawBody || !('input' in rawBody) || rawBody['input'] === undefined) {
      throw shared.validationError('Missing required field: input');
    }

    const { input, correlationId } = parsed.data;
    const svc = getAgentService(app);
    const corrId = correlationId ?? (request.id as string) ?? crypto.randomUUID();
    const userId = (request.user as { sub?: string } | undefined)?.sub;

    const result = await svc.run(id, input, {
      correlationId: corrId,
      userId,
    });

    return reply.send({
      success: true,
      data: {
        output: result.output,
        usage: result.usage,
        latencyMs: result.latencyMs,
        model: result.model,
        provider: result.provider,
      },
    });
  });
}
