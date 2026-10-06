import * as shared from '@kantorku/shared';
import type { Logger } from '../../logger.js';
import type { AgentService } from '../agents/agent.service.js';
import type { RunLogger } from '../runs/runLogger.js';
import type { ExecutionStore, WorkflowExecution, WorkflowDefinitionRecord } from './executionStore.js';

// ── InputMapping ───────────────────────────────────────────────────────────

export type InputMapping =
  | { type: 'static'; value: unknown }
  | { type: 'fromWorkflowInput'; path: string }
  | { type: 'fromStepOutput'; stepId: string; path: string }
  | { type: 'merge'; mappings: Record<string, InputMapping> };

export interface WorkflowStep {
  id: string;
  agentId: string;
  inputMapping: InputMapping;
  outputKey: string;
  retryPolicy?: { maxAttempts: number; backoffMs: number };
  timeoutMs?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  steps: WorkflowStep[];
  edges: Array<{ from: string; to: string }>;
  approvalGates: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }>;
}

// BullMQ queue interface — we type it loosely so tests can mock it without real Redis
export interface WorkflowQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * WorkflowEngine — DAG orchestration with approvals, retries, and BullMQ optional queue.
 *
 * Resilience per Spec §13:
 * - Only PROVIDER_ERROR / TIMEOUT are retried per step retryPolicy.
 * - Approval rejected → execution failed with APPROVAL_REJECTED.
 * - resume() is idempotent; completed executions are no-ops.
 * - BullMQ queue may be null → engine degrades to in-process sequential execution.
 */
export class WorkflowEngine {
  constructor(
    private readonly store: ExecutionStore,
    private readonly agentService: AgentService,
    // runLogger is retained for wiring parity; agentService already logs via its own runLogger,
    // but workflow-level events could use it in future.
    private readonly runLogger: RunLogger | null,
    private readonly queue: WorkflowQueue | null,
    private readonly logger: Logger,
  ) {}

  // ── Topological sort (Kahn's algorithm) ──────────────────────────────────

  topologicalSort(steps: Array<{ id: string }>, edges: Array<{ from: string; to: string }>): string[] {
    const ids = steps.map((s) => s.id);
    const idSet = new Set(ids);

    // Validate edges reference known steps (defensive; store already validates)
    for (const e of edges) {
      if (!idSet.has(e.from) || !idSet.has(e.to)) {
        throw shared.validationError(`Edge references unknown step: ${e.from} -> ${e.to}`);
      }
    }

    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of ids) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const edge of edges) {
      adj.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift() as string;
      sorted.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        const next = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, next);
        if (next === 0) queue.push(neighbor);
      }
    }

    if (sorted.length !== ids.length) {
      throw shared.validationError('Workflow cycle detected');
    }

    return sorted;
  }

  // ── resolveInput (recursive InputMapping) ─────────────────────────────────

  /**
   * Resolve an InputMapping to a concrete value.
   * @param mapping The input mapping to resolve
   * @param workflowInput The original workflow input
   * @param state Current execution state (keyed by outputKey)
   * @param stepIdToOutputKey Map from stepId to outputKey for fromStepOutput lookups
   */
  resolveInput(
    mapping: InputMapping,
    workflowInput: unknown,
    state: Record<string, unknown>,
    stepIdToOutputKey?: Map<string, string>,
  ): unknown {
    switch (mapping.type) {
      case 'static':
        return mapping.value;
      case 'fromWorkflowInput':
        return getByPath(workflowInput, mapping.path);
      case 'fromStepOutput': {
        // state is keyed by outputKey, but mapping references stepId
        // Use stepIdToOutputKey map to translate, fallback to stepId for backwards compat
        const outputKey = stepIdToOutputKey?.get(mapping.stepId) ?? mapping.stepId;
        const stepOutput = state[outputKey];
        if (mapping.path === '' || mapping.path === '.') return stepOutput;
        return getByPath(stepOutput, mapping.path);
      }
      case 'merge': {
        const result: Record<string, unknown> = {};
        for (const [key, sub] of Object.entries(mapping.mappings)) {
          result[key] = this.resolveInput(sub as InputMapping, workflowInput, state, stepIdToOutputKey);
        }
        return result;
      }
      default: {
        // Exhaustiveness check — should be unreachable
        const exhaustive: never = mapping as never;
        throw shared.validationError(`Unknown InputMapping type: ${(exhaustive as { type: string }).type}`);
      }
    }
  }

  // ── Internal: build approval lookup ──────────────────────────────────────

  private buildGates(def: WorkflowDefinitionRecord): Map<string, { type: 'script' | 'visual'; required: boolean }> {
    const gates = new Map<string, { type: 'script' | 'visual'; required: boolean }>();
    for (const g of def.definition.approvalGates ?? []) {
      gates.set(g.stepId, { type: g.type, required: g.required });
    }
    return gates;
  }

  private toWorkflowDefinition(def: WorkflowDefinitionRecord): WorkflowDefinition {
    return {
      id: def.id,
      name: def.name,
      version: def.version,
      steps: (def.definition.steps as WorkflowStep[]) ?? [],
      edges: def.definition.edges ?? [],
      approvalGates: (def.definition.approvalGates as WorkflowDefinition['approvalGates']) ?? [],
    };
  }

  // ── Core worker logic ────────────────────────────────────────────────────

  /**
   * processWorkflowJob is the worker's unit of work. It loads the execution
   * and definition, topologically sorts steps, and runs each pending step
   * sequentially, honoring approval gates and predecessor completion.
   *
   * Idempotent: already-completed steps are skipped; calling on a completed
   * execution is a no-op (early return).
   */
  async processWorkflowJob(executionId: string): Promise<void> {
    const execution = await this.store.getExecution(executionId);

    // Idempotent guards
    if (execution.status === 'completed' || execution.status === 'cancelled') {
      this.logger.debug({ executionId, status: execution.status }, 'workflowEngine.processWorkflowJob: already terminal, skipping');
      return;
    }
    if (execution.status === 'failed' && execution.error != null) {
      // Failed due to approval rejection or unretriable error — do not auto-resume
      // resume() will explicitly clear this; plain worker poll should not re-run failed.
      // For retriable failures that have not been resumed, we allow retry via resume().
      // So if called directly and status is failed, we skip unless it's a retriable retry scenario.
      // For simplicity, skip if status is failed.
      this.logger.debug({ executionId }, 'workflowEngine.processWorkflowJob: status failed, skipping (use resume)');
      return;
    }

    const def = await this.store.getDefinition(execution.workflowDefinitionId);
    const workflow = this.toWorkflowDefinition(def);
    const gates = this.buildGates(def);

    // Topologically sort step ids; throws on cycle
    const sortedStepIds = this.topologicalSort(workflow.steps, workflow.edges);

    // Build quick lookups
    const stepById = new Map<string, WorkflowStep>();
    for (const s of workflow.steps) stepById.set(s.id, s);

    // Build stepId -> outputKey map for fromStepOutput resolution
    const stepIdToOutputKey = new Map<string, string>();
    for (const s of workflow.steps) stepIdToOutputKey.set(s.id, s.outputKey);

    // Build predecessor map from edges
    const predecessors = new Map<string, Set<string>>();
    for (const stepId of sortedStepIds) predecessors.set(stepId, new Set());
    for (const edge of workflow.edges) {
      predecessors.get(edge.to)?.add(edge.from);
    }

    // Current execution state (accumulated outputs)
    const state: Record<string, unknown> = { ...(execution.state ?? {}) };

    // Step status lookup from DB rows
    const stepRowById = new Map<string, (typeof execution.steps)[number]>();
    for (const row of execution.steps) stepRowById.set(row.stepId, row);

    const executionStatus: string = execution.status;

    for (const stepId of sortedStepIds) {
      const stepDef = stepById.get(stepId);
      if (!stepDef) continue;

      const row = stepRowById.get(stepId);

      // Skip already completed steps (resume path)
      if (row?.status === 'completed') {
        // Ensure state has this step's output (in case execution.state was persisted)
        if (state[stepDef.outputKey] === undefined && row.output !== undefined) {
          state[stepDef.outputKey] = row.output;
        } else if (state[stepDef.outputKey] === undefined && row.output === undefined) {
          // Fallback: state already has it from prior run or from state persistence
        }
        continue;
      }

      // Predecessor check — all predecessors must be completed
      const preds = predecessors.get(stepId) ?? new Set();
      let predsCompleted = true;
      for (const predId of preds) {
        const predRow = stepRowById.get(predId);
        if (predRow?.status !== 'completed') {
          predsCompleted = false;
          break;
        }
      }
      if (!predsCompleted) {
        this.logger.debug({ executionId, stepId }, 'workflowEngine: predecessors not completed, skipping step');
        continue;
      }

      // Approval gate check — before running this step, if it has a gate
      // and the gate is required and pending, pause execution.
      const gate = gates.get(stepId);
      if (gate?.required) {
        // Check if an approval for this step already exists and is pending
        const existingApprovals = execution.approvals.filter(
          (a) => a.stepId === stepId && a.status === 'pending',
        );
        // Also check if execution already waiting_approval for this gate
        if (existingApprovals.length > 0 && executionStatus === 'waiting_approval') {
          // Still waiting — stop processing further steps
          this.logger.info({ executionId, stepId }, 'workflowEngine: waiting_approval gate still pending');
          return;
        }
        if (existingApprovals.length === 0) {
          // Check if already approved (resume path) — if approved, continue to run the step
          const approved = execution.approvals.find((a) => a.stepId === stepId && a.status === 'approved');
          if (!approved) {
            // Create approval and pause
            await this.store.createApproval({
              workflowExecutionId: executionId,
              stepId,
              type: gate.type,
              status: 'pending',
            });
            await this.store.updateExecution(executionId, { status: 'waiting_approval' });
            if (this.runLogger) {
              await this.runLogger
                .logAgentEvent({
                  workflowExecutionId: executionId,
                  eventType: 'approval_required',
                  payload: { stepId, type: gate.type },
                })
                .catch(() => {});
            }
            this.logger.info({ executionId, stepId, type: gate.type }, 'workflowEngine: approval gate created, pausing');
            return;
          }
          // Approved — fall through to run the step
        } else {
          // Pending approval exists — pause
          this.logger.info({ executionId, stepId }, 'workflowEngine: approval pending, pausing');
          return;
        }
      }

      // Run the step with retry on PROVIDER_ERROR / TIMEOUT only
      const retryPolicy = stepDef.retryPolicy ?? { maxAttempts: 1, backoffMs: 0 };
      const maxAttempts = Math.max(1, retryPolicy.maxAttempts);
      const backoffMs = retryPolicy.backoffMs ?? 0;

      // Resolve input for this step
      const resolvedInput = this.resolveInput(
        stepDef.inputMapping as InputMapping,
        execution.input,
        state,
        stepIdToOutputKey,
      );

      await this.store.updateStep(executionId, stepId, {
        status: 'running',
        input: resolvedInput,
        startedAt: new Date(),
      });

      let lastError: unknown = null;
      let succeeded = false;
      let output: unknown = undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await this.agentService.run(stepDef.agentId, resolvedInput, {
            correlationId: execution.correlationId ?? executionId,
            workflowExecutionId: executionId,
            stepId,
            attempt,
          });
          output = result.output;
          succeeded = true;
          if (attempt > 1) {
            this.logger.info({ executionId, stepId, attempt }, 'workflowEngine: step succeeded on retry');
          }
          // Persist output with the successful attempt count
          await this.store.updateStep(executionId, stepId, {
            status: 'completed',
            output,
            attempt,
            completedAt: new Date(),
          });
          break;
        } catch (err: unknown) {
          lastError = err;
          const code =
            err instanceof shared.AppError
              ? err.code
              : err instanceof Error
                ? (err as Error & { code?: string }).code
                : undefined;

          const isRetriable = code === 'PROVIDER_ERROR' || code === 'TIMEOUT';
          const hasMoreAttempts = attempt < maxAttempts;

          if (isRetriable && hasMoreAttempts) {
            this.logger.warn(
              { executionId, stepId, attempt, code, maxAttempts },
              'workflowEngine: retriable error, will retry',
            );
            if (backoffMs > 0) {
              await new Promise<void>((resolve) => setTimeout(resolve, backoffMs * attempt));
            }
            // Continue to next attempt
            continue;
          }

          // Non-retriable or exhausted retries → mark failed
          const errorMeta =
            err instanceof shared.AppError
              ? { code: err.code, message: err.message, details: err.details }
              : { message: err instanceof Error ? err.message : String(err) };

          await this.store.updateStep(executionId, stepId, {
            status: 'failed',
            error: errorMeta,
            attempt,
            completedAt: new Date(),
          });
          await this.store.updateExecution(executionId, {
            status: 'failed',
            error: errorMeta,
            completedAt: new Date(),
          });
          if (this.runLogger) {
            await this.runLogger
              .logAgentEvent({
                workflowExecutionId: executionId,
                eventType: 'step_failed',
                payload: { stepId, error: errorMeta, attempt },
              })
              .catch(() => {});
          }
          this.logger.error({ executionId, stepId, error: errorMeta }, 'workflowEngine: step failed');
          return;
        }
      }

      if (!succeeded) {
        // Should have returned above; defensive
        const errorMeta =
          lastError instanceof shared.AppError
            ? { code: lastError.code, message: lastError.message, details: lastError.details }
            : { message: lastError instanceof Error ? lastError.message : String(lastError) };
        await this.store.updateExecution(executionId, {
          status: 'failed',
          error: errorMeta,
          completedAt: new Date(),
        });
        return;
      }

      // Success → persist accumulated state
      state[stepDef.outputKey] = output;
      await this.store.updateExecution(executionId, { state: { ...state } });

      // Update local stepRowById status so subsequent iterations see it as completed
      const rowRef = stepRowById.get(stepId);
      if (rowRef) {
        rowRef.status = 'completed';
        rowRef.output = output;
      } else {
        // Insert a new local entry for in-memory tracking (DB already updated)
        stepRowById.set(stepId, {
          id: `local-${stepId}`,
          workflowExecutionId: executionId,
          stepId,
          agentDefinitionId: null,
          status: 'completed',
          attempt: 1,
          input: resolvedInput,
          output,
          error: undefined,
          startedAt: new Date(),
          completedAt: new Date(),
        });
      }

      if (this.runLogger) {
        await this.runLogger
          .logAgentEvent({
            workflowExecutionId: executionId,
            eventType: 'step_completed',
            payload: { stepId, outputKey: stepDef.outputKey },
          })
          .catch(() => {});
      }
    }

    // All steps completed → mark execution completed
    const stillPending = Array.from(stepRowById.values()).some((r) => r.status !== 'completed');
    if (!stillPending) {
      await this.store.updateExecution(executionId, {
        status: 'completed',
        completedAt: new Date(),
      });
      this.logger.info({ executionId }, 'workflowEngine: execution completed');
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  private async runInProcess(executionId: string): Promise<void> {
    // In-process fallback when queue is null — run synchronously.
    // Fire and forget errors are logged but not thrown to caller (execute already returned id).
    try {
      await this.processWorkflowJob(executionId);
    } catch (err: unknown) {
      this.logger.error({ err: String(err), executionId }, 'workflowEngine: in-process execution failed');
      // Mark failed so resume can retry
      try {
        await this.store.updateExecution(executionId, {
          status: 'failed',
          error: err instanceof shared.AppError
            ? { code: err.code, message: err.message, details: err.details }
            : { message: err instanceof Error ? err.message : String(err) },
          completedAt: new Date(),
        });
      } catch {
        // ignore
      }
    }
  }

  async execute(
    definitionId: string,
    input: unknown,
    ctx: { userId: string; correlationId: string },
  ): Promise<string> {
    console.log('[WORKFLOW ENGINE] execute called with:', { definitionId, input });
    console.log('[WORKFLOW ENGINE] this.store:', this.store);
    console.log('[WORKFLOW ENGINE] this.store.constructor.name:', this.store.constructor.name);
    const executionId = await this.store.createExecution(
      definitionId,
      input,
      ctx.userId,
      ctx.correlationId,
    );

    if (this.queue) {
      try {
        await this.queue.add(
          'workflow:execute',
          { executionId },
          { attempts: 1, removeOnComplete: 100 },
        );
        this.logger.info({ executionId, definitionId }, 'workflowEngine.execute: enqueued');
      } catch (err: unknown) {
        // Queue failed → fall back to in-process with warning per resilience spec
        this.logger.warn(
          { err: String(err), executionId, definitionId },
          'workflowEngine.execute: queue unavailable, falling back to in-process',
        );
        // Fire-and-forget in-process (do not await to keep 202 semantics)
        void this.runInProcess(executionId);
      }
    } else {
      this.logger.warn({ executionId }, 'workflowEngine.execute: no queue, running in-process');
      void this.runInProcess(executionId);
    }

    return executionId;
  }

  async resume(executionId: string): Promise<void> {
    const execution = await this.store.getExecution(executionId);

    // Idempotent: completed/cancelled are no-ops
    if (execution.status === 'completed' || execution.status === 'cancelled') {
      this.logger.debug({ executionId, status: execution.status }, 'workflowEngine.resume: terminal, no-op');
      return;
    }

    // waiting_approval without approval decision should remain waiting
    // But if approvals for the gate are approved, we should continue.
    // Reset waiting_approval → running so processWorkflowJob can proceed
    if (execution.status === 'waiting_approval') {
      // Check if the pending approval was already decided (approved case via handleApproval already calls resume)
      // If still pending, resume should be no-op (waiting for human)
      const hasPending = execution.approvals.some((a) => a.status === 'pending');
      if (hasPending) {
        this.logger.debug({ executionId }, 'workflowEngine.resume: still waiting_approval with pending approval, no-op');
        return;
      }
      // All gates approved — reset to running
      await this.store.updateExecution(executionId, { status: 'running' });
    } else if (execution.status === 'failed') {
      // Reset failed execution to running for retry (state preserved)
      await this.store.updateExecution(executionId, { status: 'running', error: null });

      // Reset failed steps to pending so they will be retried
      for (const step of execution.steps) {
        if (step.status === 'failed') {
          await this.store.updateStep(executionId, step.stepId, { status: 'pending', error: null });
        }
      }
    }

    if (this.queue) {
      try {
        await this.queue.add('workflow:execute', { executionId }, { attempts: 1, removeOnComplete: 100 });
        this.logger.info({ executionId }, 'workflowEngine.resume: re-enqueued');
      } catch (err: unknown) {
        this.logger.warn({ err: String(err), executionId }, 'workflowEngine.resume: queue failed, falling back to in-process');
        void this.runInProcess(executionId);
      }
    } else {
      this.logger.info({ executionId }, 'workflowEngine.resume: no queue, running in-process');
      void this.runInProcess(executionId);
    }
  }

  async handleApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    reason?: string,
    decidedBy?: string,
  ): Promise<void> {
    const approval = await this.store.getApproval(approvalId);

    if (approval.status !== 'pending') {
      throw shared.validationError(`Approval already decided: ${approval.status}`);
    }

    if (decision === 'approved') {
      await this.store.updateApproval(approvalId, {
        status: 'approved',
        decidedBy: decidedBy ?? null,
        reason: reason ?? null,
        decidedAt: new Date(),
      });
      this.logger.info({ approvalId, executionId: approval.workflowExecutionId }, 'workflowEngine.handleApproval: approved');

      // Reset execution from waiting_approval → running and resume
      await this.store.updateExecution(approval.workflowExecutionId, { status: 'running' });
      if (this.runLogger) {
        await this.runLogger
          .logAgentEvent({
            workflowExecutionId: approval.workflowExecutionId,
            eventType: 'approval_approved',
            payload: { approvalId, stepId: approval.stepId },
          })
          .catch(() => {});
      }
      await this.resume(approval.workflowExecutionId);
    } else {
      // Rejected → mark failed with APPROVAL_REJECTED, preserve state for revision, do NOT auto-advance
      await this.store.updateApproval(approvalId, {
        status: 'rejected',
        decidedBy: decidedBy ?? null,
        reason: reason ?? null,
        decidedAt: new Date(),
      });
      await this.store.updateExecution(approval.workflowExecutionId, {
        status: 'failed',
        error: { code: 'APPROVAL_REJECTED', message: reason ?? 'Approval rejected', approvalId },
        completedAt: new Date(),
      });
      if (this.runLogger) {
        await this.runLogger
          .logAgentEvent({
            workflowExecutionId: approval.workflowExecutionId,
            eventType: 'approval_rejected',
            payload: { approvalId, stepId: approval.stepId, reason },
          })
          .catch(() => {});
      }
      this.logger.info(
        { approvalId, executionId: approval.workflowExecutionId, reason },
        'workflowEngine.handleApproval: rejected, execution failed APPROVAL_REJECTED',
      );
    }
  }
}

/**
 * Factory helper to create a BullMQ queue when Redis is available, else return null.
 * Caller is responsible for lifecycle (close).
 * This is intentionally lazy — only called at wiring time in app.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWorkflowQueue(
  redisUrl: string | undefined,
  logger: Logger,
  opts: { isTestMode?: boolean } = {}
): Promise<WorkflowQueue | null> {
  // In test mode, skip Redis/BullMQ entirely to avoid connection timeouts
  if (opts.isTestMode) {
    logger.debug('Test mode detected — skipping BullMQ queue creation');
    return null;
  }

  if (!redisUrl) {
    logger.warn('REDIS_URL not set — workflow queue disabled, using in-process fallback');
    return null;
  }
  try {
    // Dynamic import so bundling/tests without bullmq still work
    const bullmq = await import('bullmq');
    const queue = new bullmq.Queue('kantorku-workflows', {
      connection: { url: redisUrl } as unknown as never,
    });
    // Probe connection with a quick no-op; if it fails, fall back
    await queue.waitUntilReady().catch((err: unknown) => {
      throw err;
    });
    logger.info('BullMQ workflow queue ready');
    return queue as unknown as WorkflowQueue;
  } catch (err: unknown) {
    logger.warn({ err: String(err) }, 'BullMQ queue unavailable — falling back to in-process execution');
    return null;
  }
}
