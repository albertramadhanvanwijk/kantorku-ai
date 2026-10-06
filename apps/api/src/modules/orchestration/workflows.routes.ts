import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { ExecutionStore } from './executionStore.js';
import type { WorkflowService } from './workflow.service.js';
import type { WorkflowEngine } from './workflowEngine.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  slug: z.string().optional(),
});

const createWorkflowBodySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  definition: z.object({
    steps: z.array(
      z.object({
        id: z.string().min(1),
        agentId: z.string().min(1),
        inputMapping: z.unknown(),
        outputKey: z.string().min(1),
        retryPolicy: z.object({ maxAttempts: z.number().int().min(1), backoffMs: z.number().int().min(0) }).optional(),
        timeoutMs: z.number().int().optional(),
      }),
    ),
    edges: z.array(z.object({ from: z.string().min(1), to: z.string().min(1) })),
    approvalGates: z
      .array(z.object({ stepId: z.string().min(1), type: z.enum(['script', 'visual']), required: z.boolean() }))
      .optional(),
  }),
});

const executeBodySchema = z.object({
  input: z.unknown(),
  correlationId: z.string().optional(),
});

const executionsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  status: z.string().optional(),
  definitionId: z.string().optional(),
  correlationId: z.string().optional(),
});

function getStore(app: FastifyInstance): ExecutionStore {
  const s = (app as unknown as Record<string, unknown>)['executionStore'] as ExecutionStore | undefined;
  if (!s) throw new shared.AppError('SYSTEM_ERROR', 'ExecutionStore not configured', 500);
  return s;
}

function getWorkflowService(app: FastifyInstance): WorkflowService {
  const ws = (app as unknown as Record<string, unknown>)['workflowService'] as WorkflowService | undefined;
  if (ws) return ws;
  // Fallback: construct lightweight delegation via store for tests that only wire store
  const store = getStore(app);
  // Return a shim that delegates to store for list/get
  const shim = {
    listWorkflows: (filters?: unknown) => store.listDefinitions(filters as never),
    getWorkflow: (id: string) => store.getDefinition(id),
    createWorkflow: (rec: { slug: string; name: string; version: string; definition: unknown }) =>
      store.createDefinition(rec as never),
  } as unknown as WorkflowService;
  return shim;
}

function getWorkflowEngine(app: FastifyInstance): WorkflowEngine {
  const e = (app as unknown as Record<string, unknown>)['workflowEngine'] as WorkflowEngine | undefined;
  if (!e) throw new shared.AppError('SYSTEM_ERROR', 'WorkflowEngine not configured', 500);
  return e;
}

export async function workflowsRoutes(app: FastifyInstance): Promise<void> {
  // Important: static executions list must be registered BEFORE :id param to avoid shadowing
  // GET /api/workflows/executions — paginated list
  app.get('/workflows/executions', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = executionsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const { page, pageSize, status, definitionId, correlationId } = parsed.data;
    const store = getStore(app);
    const res = await store.listExecutions({
      status,
      workflowDefinitionId: definitionId,
      correlationId,
      page,
      pageSize,
    });
    return reply.send({
      success: true,
      data: { rows: res.rows, total: res.total, page: page ?? 1, pageSize: pageSize ?? 20 },
    });
  });

  // GET /api/workflows/executions/:id — execution + steps + approvals
  app.get('/workflows/executions/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing execution id');
    const store = getStore(app);
    const exec = await store.getExecution(id);
    return reply.send({ success: true, data: exec });
  });

  // POST /api/workflows/executions/:id/resume
  app.post('/workflows/executions/:id/resume', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing execution id');
    const engine = getWorkflowEngine(app);
    await engine.resume(id);
    // Return current status
    const store = getStore(app);
    try {
      const exec = await store.getExecution(id);
      return reply.send({ success: true, data: { status: exec.status, id: exec.id } });
    } catch {
      return reply.send({ success: true, data: { status: 'resumed', id } });
    }
  });

  // GET /api/workflows — list
  app.get('/workflows', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const { page, pageSize, slug } = parsed.data;
    const svc = getWorkflowService(app);
    const res = await svc.listWorkflows({ slug, page, pageSize });
    return reply.send({
      success: true,
      data: { rows: res.rows, total: res.total, page: page ?? 1, pageSize: pageSize ?? 20 },
    });
  });

  // POST /api/workflows — create
  app.post('/workflows', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createWorkflowBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid input', { issues: parsed.error.issues });
    }
    const svc = getWorkflowService(app);
    const id = await svc.createWorkflow({
      slug: parsed.data.slug,
      name: parsed.data.name,
      version: parsed.data.version,
      definition: parsed.data.definition as unknown as never,
    });
    // Fetch created record for response
    const created = await svc.getWorkflow(id);
    return reply.status(201).send({ success: true, data: created });
  });

  // GET /api/workflows/:id — get definition
  app.get('/workflows/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing workflow id');
    const svc = getWorkflowService(app);
    const def = await svc.getWorkflow(id);
    return reply.send({ success: true, data: def });
  });

  // POST /api/workflows/:id/execute — 202 { executionId }
  app.post('/workflows/:id/execute', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing workflow id');
    const parsed = executeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid input', { issues: parsed.error.issues });
    }
    const rawBody = request.body as Record<string, unknown> | null | undefined;
    if (!rawBody || !('input' in rawBody)) {
      throw shared.validationError('Missing required field: input');
    }

    const { input, correlationId } = parsed.data;
    const engine = getWorkflowEngine(app);
    const userId = (request.user as { sub?: string } | undefined)?.sub ?? 'unknown';
    const corrId = correlationId ?? (request.id as string) ?? crypto.randomUUID();

    const executionId = await engine.execute(id, input, { userId, correlationId: corrId });

    return reply.status(202).send({
      success: true,
      data: { executionId, correlationId: corrId },
    });
  });
}
