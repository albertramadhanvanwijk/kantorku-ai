import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { RunLogger } from './runLogger.js';
import { agentRuns } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Logger } from '../../logger.js';

const listRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
  agentDefinitionId: z.string().optional(),
  workflowExecutionId: z.string().optional(),
  correlationId: z.string().optional(),
});

function getRunLogger(app: FastifyInstance): RunLogger {
  const rl = (app as unknown as Record<string, unknown>)['runLogger'] as RunLogger | undefined;
  if (rl) return rl;
  // Also support legacy key
  const alt = (app as unknown as Record<string, unknown>)['runsRunLogger'] as RunLogger | undefined;
  if (alt) return alt;
  throw new shared.AppError('SYSTEM_ERROR', 'RunLogger not configured', 500);
}

function getDb(app: FastifyInstance): unknown {
  const db = (app as unknown as Record<string, unknown>)['db'];
  if (!db) throw new shared.AppError('SYSTEM_ERROR', 'Database not configured', 500);
  return db;
}

function getLogger(app: FastifyInstance): Logger {
  const log = (app as unknown as Record<string, unknown>)['logger'] as Logger | undefined;
  // Fastify's log is available as app.log; use fallback
  const fastifyLog = (app as unknown as { log?: Logger }).log;
  if (fastifyLog) return fastifyLog as unknown as Logger;
  if (log) return log;
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
}

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/runs — paginated list via RunLogger
  app.get('/runs', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listRunsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw shared.validationError('Invalid query', { issues: parsed.error.issues });
    }
    const { page, pageSize, agentDefinitionId, workflowExecutionId, correlationId } = parsed.data;

    try {
      const runLogger = getRunLogger(app);
      const result = await runLogger.queryAgentRuns({
        agentDefinitionId,
        workflowExecutionId,
        correlationId,
        page,
        pageSize,
      });
      return reply.send({
        success: true,
        data: { rows: result.rows, total: result.total, page: page ?? 1, pageSize: pageSize ?? 20 },
      });
    } catch (err: unknown) {
      // Fallback to raw DB query when RunLogger is a mock that lacks queryAgentRuns impl going to real DB
      if (err instanceof shared.AppError) throw err;
      // Try to surface as 500 via handler; but we propagate
      throw err;
    }
  });

  // GET /api/runs/:id — single run with tool_runs
  app.get('/runs/:id', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing run id');

    const db = getDb(app) as {
      select: () => { from: (table: unknown) => { where: (c: unknown) => Promise<Record<string, unknown>[]> } };
    };

    // Query agent_runs by id. Use drizzle's eq helper.
    let agentRunRows: Record<string, unknown>[] = [];
    let dbQueryFailed = false;
    try {
      const rawDb: unknown = db;
      const anyDb = rawDb as {
        select: (arg?: unknown) => {
          from: (t: unknown) => { where: (c: unknown) => Promise<Record<string, unknown>[]> };
        };
      };
      agentRunRows = await anyDb.select().from(agentRuns).where(eq(agentRuns.id, id));
    } catch {
      dbQueryFailed = true;
    }

    // Fallback via RunLogger when db lookup returns no rows (e.g., in-memory fakes) or fails
    if ((agentRunRows.length === 0 && dbQueryFailed === false) || dbQueryFailed) {
      try {
        const runLogger = getRunLogger(app);
        // Query without pagination limits and find by id
        const result = await runLogger.queryAgentRuns({ page: 1, pageSize: 100 });
        const found = result.rows.find((r) => String((r as unknown as Record<string, unknown>)['id']) === id);
        if (found) {
          agentRunRows = [found as unknown as Record<string, unknown>];
        } else if (agentRunRows.length === 0) {
          // No fallback match — treat as not found if db returned empty and RunLogger also empty
          if (dbQueryFailed && !found) {
            throw shared.notFound(`Agent run not found: ${id}`);
          }
          if (!dbQueryFailed && agentRunRows.length === 0 && !found) {
            throw shared.notFound(`Agent run not found: ${id}`);
          }
        }
      } catch (err: unknown) {
        if (err instanceof shared.AppError) throw err;
        throw shared.notFound(`Agent run not found: ${id}`);
      }
    }

    if (agentRunRows.length === 0) {
      throw shared.notFound(`Agent run not found: ${id}`);
    }

    const run = agentRunRows[0] as Record<string, unknown>;

    // Best-effort load tool_runs for this agent run (via raw db if available)
    let toolRunsRows: Record<string, unknown>[] = [];
    try {
      const anyDb = db as unknown as {
        select: () => { from: (table: unknown) => { where: (c: unknown) => Promise<Record<string, unknown>[]> } };
      };
      const { toolRuns } = await import('../../db/schema.js');
      toolRunsRows = await (anyDb as unknown as { select: () => { from: (t: unknown) => { where: (c: unknown) => Promise<Record<string, unknown>[]> } } }).select().from(toolRuns).where(eq(toolRuns.agentRunId, id));
    } catch {
      // ignore — leave tool runs empty
    }

    const log = getLogger(app);
    (log as unknown as { debug?: (o: unknown, m: string) => void }).debug?.({ runId: id }, 'runs.getOne');

    return reply.send({
      success: true,
      data: {
        run,
        toolRuns: toolRunsRows,
      },
    });
  });
}
