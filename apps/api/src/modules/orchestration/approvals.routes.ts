import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { WorkflowEngine } from './workflowEngine.js';

const decideBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

function getWorkflowEngine(app: FastifyInstance): WorkflowEngine {
  const e = (app as unknown as Record<string, unknown>)['workflowEngine'] as WorkflowEngine | undefined;
  if (!e) throw new shared.AppError('SYSTEM_ERROR', 'WorkflowEngine not configured', 500);
  return e;
}

export async function approvalsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/approvals/:id/decide
  app.post('/approvals/:id/decide', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) throw shared.validationError('Missing approval id');

    const parsed = decideBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw shared.validationError('Invalid input', { issues: parsed.error.issues });
    }

    const { decision, reason } = parsed.data;
    const engine = getWorkflowEngine(app);
    const userId = (request.user as { sub?: string } | undefined)?.sub;

    await engine.handleApproval(id, decision, reason, userId);

    return reply.send({
      success: true,
      data: { approvalId: id, decision, reason: reason ?? null },
    });
  });
}
