import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as shared from '@kantorku/shared';
import { WorkflowEngine, type InputMapping, type WorkflowQueue } from './workflowEngine.js';
import type { ExecutionStore } from './executionStore.js';
import type { Logger } from '../../logger.js';
import type { AgentService } from '../agents/agent.service.js';

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'debug',
  } as unknown as Logger;
}

function createMockQueue(): WorkflowQueue & { add: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
}

// Minimal in-memory ExecutionStore fake that supports the WorkflowEngine contract
class InMemoryStore {
  definitions = new Map<string, { id: string; slug: string; name: string; version: string; definition: { steps: Array<Record<string, unknown>>; edges: Array<{ from: string; to: string }>; approvalGates?: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }> } }>();
  executions = new Map<string, { id: string; workflowDefinitionId: string; status: string; input: unknown; state: Record<string, unknown>; error?: unknown; correlationId?: string; createdBy?: string | null; startedAt?: Date | null; completedAt?: Date | null; createdAt: Date; updatedAt: Date }>();
  steps = new Map<string, Array<{ id: string; workflowExecutionId: string; stepId: string; agentDefinitionId?: string | null; status: string; attempt: number; input?: unknown; output?: unknown; error?: unknown; startedAt?: Date | null; completedAt?: Date | null }>>();
  approvalsStore = new Map<string, { id: string; workflowExecutionId: string; stepId: string; type: string; status: string; decidedBy?: string | null; reason?: string | null; createdAt: Date; decidedAt?: Date | null }>();

  private nextId(): string {
    const n = this.definitions.size + this.executions.size + this.approvalsStore.size + 100;
    return `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
  }

  seedDefinition(def: { slug: string; name?: string; version?: string; definition: { steps: Array<Record<string, unknown>>; edges: Array<{ from: string; to: string }>; approvalGates?: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }> } }) {
    const id = this.nextId();
    this.definitions.set(id, {
      id,
      slug: def.slug,
      name: def.name ?? def.slug,
      version: def.version ?? '1.0.0',
      definition: def.definition,
    });
    this.definitions.set(def.slug, this.definitions.get(id) as never);
    return id;
  }

  async getDefinition(definitionId: string) {
    const found = this.definitions.get(definitionId);
    if (!found) throw shared.notFound(`Workflow definition not found: ${definitionId}`);
    return {
      id: found.id,
      slug: found.slug,
      name: found.name,
      version: found.version,
      definition: found.definition as unknown as { steps: Array<{ id: string; agentId: string; inputMapping: unknown; outputKey: string; retryPolicy?: { maxAttempts: number; backoffMs: number } }>; edges: Array<{ from: string; to: string }>; approvalGates?: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }> },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async createDefinition(record: { slug: string; name: string; version: string; definition: { steps: Array<Record<string, unknown>>; edges: Array<{ from: string; to: string }>; approvalGates?: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }> } }) {
    const id = this.nextId();
    this.definitions.set(id, {
      id,
      slug: record.slug,
      name: record.name,
      version: record.version,
      definition: record.definition,
    });
    this.definitions.set(record.slug, this.definitions.get(id) as never);
    return id;
  }

  async createExecution(definitionId: string, input: unknown, userId: string, correlationId: string) {
    const def = await this.getDefinition(definitionId);
    const id = this.nextId();
    this.executions.set(id, {
      id,
      workflowDefinitionId: def.id,
      status: 'running',
      input,
      state: {},
      correlationId,
      createdBy: userId,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const stepRows: Array<{ id: string; workflowExecutionId: string; stepId: string; agentDefinitionId?: string | null; status: string; attempt: number; input?: unknown; output?: unknown; error?: unknown; startedAt?: Date | null; completedAt?: Date | null }> = [];
    for (const s of def.definition.steps) {
      stepRows.push({
        id: this.nextId(),
        workflowExecutionId: id,
        stepId: String((s as Record<string, unknown>)['id']),
        agentDefinitionId: null,
        status: 'pending',
        attempt: 1,
      });
    }
    this.steps.set(id, stepRows);
    return id;
  }

  async getExecution(id: string) {
    const exec = this.executions.get(id);
    if (!exec) throw shared.notFound(`Workflow execution not found: ${id}`);
    const stepRows = this.steps.get(id) ?? [];
    const approvals = Array.from(this.approvalsStore.values()).filter((a) => a.workflowExecutionId === id);
    return {
      id: exec.id,
      workflowDefinitionId: exec.workflowDefinitionId,
      status: exec.status,
      input: exec.input,
      state: exec.state,
      error: exec.error,
      correlationId: exec.correlationId,
      createdBy: exec.createdBy ?? null,
      startedAt: exec.startedAt ?? null,
      completedAt: exec.completedAt ?? null,
      createdAt: exec.createdAt,
      updatedAt: exec.updatedAt,
      steps: stepRows.map((r) => ({ ...r })),
      approvals: approvals.map((a) => ({ ...a })),
    };
  }

  async updateStep(executionId: string, stepId: string, patch: Record<string, unknown>) {
    const rows = this.steps.get(executionId);
    if (!rows) return;
    const row = rows.find((r) => r.stepId === stepId);
    if (row) Object.assign(row, patch, { updatedAt: new Date() });
  }

  async updateExecution(executionId: string, patch: Record<string, unknown>) {
    const exec = this.executions.get(executionId);
    if (!exec) return;
    Object.assign(exec, patch, { updatedAt: new Date() });
  }

  async listExecutions(_filters: unknown) {
    return { rows: [], total: 0 };
  }

  async createApproval(record: { workflowExecutionId: string; stepId: string; type: 'script' | 'visual'; status?: string }) {
    const id = this.nextId();
    this.approvalsStore.set(id, {
      id,
      workflowExecutionId: record.workflowExecutionId,
      stepId: record.stepId,
      type: record.type,
      status: record.status ?? 'pending',
      createdAt: new Date(),
      decidedAt: null,
    });
    return id;
  }

  async getApproval(id: string) {
    const found = this.approvalsStore.get(id);
    if (!found) throw shared.notFound(`Approval not found: ${id}`);
    return { ...found };
  }

  async updateApproval(id: string, patch: Record<string, unknown>) {
    const row = this.approvalsStore.get(id);
    if (row) Object.assign(row, patch);
  }

  async listApprovals(workflowExecutionId: string) {
    return Array.from(this.approvalsStore.values()).filter((a) => a.workflowExecutionId === workflowExecutionId);
  }
}

function makeAgentServiceMock(behaviors?: Record<string, unknown | Error | ((input: unknown) => unknown)>) {
  const callCounts = new Map<string, number>();
  const service = {
    run: vi.fn().mockImplementation(async (agentId: string, input: unknown, _ctx: unknown) => {
      const count = (callCounts.get(agentId) ?? 0) + 1;
      callCounts.set(agentId, count);
      const behavior = behaviors?.[agentId];
      if (behavior instanceof Error) throw behavior;
      if (typeof behavior === 'function') {
        const result = (behavior as (input: unknown) => unknown)(input);
        if (result instanceof Error) throw result;
        return result as { output: unknown; usage?: unknown; latencyMs: number; model: string; provider: '9router' };
      }
      if (behavior !== undefined) return behavior as { output: unknown; latencyMs: number; model: string; provider: '9router' };
      // Default: echo summary
      return {
        output: { summary: `output-of-${agentId}`, input },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 50,
        model: 'mid-test-v1',
        provider: '9router' as const,
      };
    }),
    _callCounts: callCounts,
  };
  return service;
}

describe('WorkflowEngine', () => {
  let store: InMemoryStore;
  let queue: ReturnType<typeof createMockQueue>;
  let logger: Logger;
  let runLogger: { logAgentEvent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    store = new InMemoryStore();
    queue = createMockQueue();
    logger = mockLogger();
    runLogger = { logAgentEvent: vi.fn().mockResolvedValue('event-id') };
  });

  function createEngine(agentService: unknown) {
    return new WorkflowEngine(
      store as unknown as ExecutionStore,
      agentService as unknown as AgentService,
      runLogger as unknown as never,
      queue,
      logger,
    );
  }

  // 1) topologicalSort orders steps respecting edges
  it('topologicalSort orders steps respecting edges', () => {
    const engine = createEngine(makeAgentServiceMock());
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [{ from: 'a', to: 'b' }];
    const sorted = engine.topologicalSort(steps, edges);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted).toHaveLength(3);
    expect(sorted).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  // 2) throws on cycle detection
  it('throws on cycle detection', () => {
    const engine = createEngine(makeAgentServiceMock());
    const steps = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ];
    expect(() => engine.topologicalSort(steps, edges)).toThrow(/cycle/i);
    try {
      engine.topologicalSort(steps, edges);
    } catch (err: unknown) {
      expect((err as shared.AppError).code).toBe('VALIDATION_ERROR');
    }
  });

  // 3) resolveInput merges fromWorkflowInput + fromStepOutput
  it('resolveInput merges fromWorkflowInput + fromStepOutput', () => {
    const engine = createEngine(makeAgentServiceMock());
    const mapping: InputMapping = {
      type: 'merge',
      mappings: {
        q: { type: 'fromWorkflowInput', path: 'query' },
        r: { type: 'fromStepOutput', stepId: 'research', path: 'summary' },
      },
    };
    const result = engine.resolveInput(mapping, { query: 'BTC' }, { research: { summary: 'ok' } });
    expect(result).toEqual({ q: 'BTC', r: 'ok' });
  });

  it('resolveInput handles static and nested merge', () => {
    const engine = createEngine(makeAgentServiceMock());
    expect(engine.resolveInput({ type: 'static', value: 42 }, {}, {})).toBe(42);
    expect(engine.resolveInput({ type: 'fromWorkflowInput', path: 'a.b' }, { a: { b: 'hello' } }, {})).toBe('hello');
    expect(engine.resolveInput({ type: 'fromStepOutput', stepId: 's1', path: 'x' }, {}, { s1: { x: 99 } })).toBe(99);
    // fromStepOutput with empty path returns entire step output
    expect(engine.resolveInput({ type: 'fromStepOutput', stepId: 's1', path: '' }, {}, { s1: { x: 99 } })).toEqual({ x: 99 });
  });

  // 4) execute creates execution and enqueues job
  it('execute creates execution and enqueues job', async () => {
    store.seedDefinition({
      slug: 'content-production-v1',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'fromWorkflowInput', path: 'query' }, outputKey: 'research' },
          { id: 'strategist', agentId: 'strategist-agent', inputMapping: { type: 'fromStepOutput', stepId: 'research', path: 'summary' }, outputKey: 'strategy' },
        ],
        edges: [{ from: 'research', to: 'strategist' }],
      },
    });
    const engine = createEngine(makeAgentServiceMock());

    const id = await engine.execute('content-production-v1', { query: 'test' }, { userId: 'user-1', correlationId: 'corr-1' });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith('workflow:execute', { executionId: id }, expect.objectContaining({ attempts: 1 }));
    // Execution should exist and be running
    const exec = await store.getExecution(id);
    expect(exec.status).toBe('running');
    expect(exec.input).toEqual({ query: 'test' });
    expect(exec.correlationId).toBe('corr-1');
  });

  it('execute falls back to in-process when queue is null', async () => {
    store.seedDefinition({
      slug: 'wf-nq',
      definition: {
        steps: [{ id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: { q: 'hi' } }, outputKey: 'research' }],
        edges: [],
      },
    });
    // Engine with null queue should still create execution and run in-process (fire-and-forget)
    const agentService = makeAgentServiceMock();
    const engine = new WorkflowEngine(
      store as unknown as ExecutionStore,
      agentService as unknown as AgentService,
      runLogger as unknown as never,
      null,
      logger,
    );
    const id = await engine.execute('wf-nq', { query: 'test' }, { userId: 'user-1', correlationId: 'corr-nq' });
    expect(id).toBeDefined();
    // Allow in-process to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const exec = await store.getExecution(id);
    // Should have completed via in-process fallback
    expect(exec.status).toBe('completed');
    expect(agentService.run).toHaveBeenCalledTimes(1);
  });

  // 5) resume is idempotent when already completed
  it('resume is idempotent when already completed', async () => {
    store.seedDefinition({
      slug: 'wf-resume-idempotent',
      definition: {
        steps: [{ id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'research' }],
        edges: [],
      },
    });
    const engine = createEngine(makeAgentServiceMock());
    const id = await engine.execute('wf-resume-idempotent', {}, { userId: 'u1', correlationId: 'c1' });

    // Simulate completed execution
    const exec = store.executions.get(id);
    if (exec) exec.status = 'completed';
    const stepRows = store.steps.get(id);
    if (stepRows) for (const r of stepRows) r.status = 'completed';

    queue.add.mockClear();
    await engine.resume(id);
    expect(queue.add).not.toHaveBeenCalled();

    // Second resume also no-op
    await engine.resume(id);
    expect(queue.add).not.toHaveBeenCalled();
  });

  // 6) approval gate pauses execution with waiting_approval
  it('approval gate pauses execution with waiting_approval', async () => {
    store.seedDefinition({
      slug: 'wf-gated',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: { q: 'hi' } }, outputKey: 'research' },
          { id: 'strategist', agentId: 'strategist-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'strategy' },
        ],
        edges: [{ from: 'research', to: 'strategist' }],
        approvalGates: [{ stepId: 'strategist', type: 'script', required: true }],
      },
    });

    const agentService = makeAgentServiceMock();
    const engine = createEngine(agentService);

    const id = await engine.execute('wf-gated', { query: 'test' }, { userId: 'u1', correlationId: 'c-gate' });
    // Process the workflow job synchronously (as worker would)
    await engine.processWorkflowJob(id);

    const exec = await store.getExecution(id);
    expect(exec.status).toBe('waiting_approval');
    // Only first step should have been executed
    expect(agentService.run).toHaveBeenCalledTimes(1);
    expect(agentService.run).toHaveBeenCalledWith('research-agent', expect.anything(), expect.objectContaining({ stepId: 'research' }));
    // Approval should exist for strategist step
    expect(exec.approvals).toHaveLength(1);
    expect(exec.approvals[0]?.stepId).toBe('strategist');
    expect(exec.approvals[0]?.status).toBe('pending');
  });

  // 7) handleApproval rejected marks failed with APPROVAL_REJECTED
  it('handleApproval rejected marks failed with APPROVAL_REJECTED', async () => {
    store.seedDefinition({
      slug: 'wf-reject',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'research' },
          { id: 'strategist', agentId: 'strategist-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'strategy' },
        ],
        edges: [{ from: 'research', to: 'strategist' }],
        approvalGates: [{ stepId: 'strategist', type: 'script', required: true }],
      },
    });

    const engine = createEngine(makeAgentServiceMock());
    const id = await engine.execute('wf-reject', {}, { userId: 'u1', correlationId: 'c-reject' });
    await engine.processWorkflowJob(id);

    const execBefore = await store.getExecution(id);
    const approvalId = execBefore.approvals[0]?.id;
    expect(approvalId).toBeDefined();

    queue.add.mockClear();
    await engine.handleApproval(approvalId as string, 'rejected', 'bad angle');

    const execAfter = await store.getExecution(id);
    expect(execAfter.status).toBe('failed');
    // Error should carry APPROVAL_REJECTED
    const err = execAfter.error as Record<string, unknown> | undefined;
    expect(err?.['code'] ?? (err as Record<string, unknown>)?.['code']).toBe('APPROVAL_REJECTED');
    // No auto-advance: strategist step should not have run to completion
    const strategistStep = execAfter.steps.find((s) => s.stepId === 'strategist');
    expect(strategistStep?.status).not.toBe('completed');
    // handleApproval rejected should NOT enqueue
    // resume should not be called for rejected case — queue.add only for approved
    // Our mock queue should not have been called from handleApproval's rejected branch
    // (it does not call resume for rejected)
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('handleApproval approved resumes and completes workflow', async () => {
    store.seedDefinition({
      slug: 'wf-approved',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'research' },
          { id: 'strategist', agentId: 'strategist-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'strategy' },
        ],
        edges: [{ from: 'research', to: 'strategist' }],
        approvalGates: [{ stepId: 'strategist', type: 'script', required: true }],
      },
    });

    const agentService = makeAgentServiceMock();
    const engine = createEngine(agentService);

    const id = await engine.execute('wf-approved', {}, { userId: 'u1', correlationId: 'c-approve' });
    await engine.processWorkflowJob(id);

    const execBefore = await store.getExecution(id);
    const approvalId = execBefore.approvals[0]?.id as string;

    // Mock queue to capture resume enqueue, but also allow in-process fallback to complete
    // For this test, we set queue to null behavior by intercepting resume's in-process path:
    // After handleApproval, resume will enqueue; but we need to simulate worker picking it up.
    // Instead, we will call processWorkflowJob after handleApproval manually to simulate worker.
    await engine.handleApproval(approvalId, 'approved');

    // After approval, the engine's handleApproval calls resume which enqueues; but execution state
    // should be running and approval approved
    const execMid = await store.getExecution(id);
    expect(execMid.approvals[0]?.status).toBe('approved');

    // Simulate worker processing after approval — reuse queue.add mock to verify enqueued, then run worker
    expect(queue.add).toHaveBeenCalled();
    await engine.processWorkflowJob(id);

    const execAfter = await store.getExecution(id);
    expect(execAfter.status).toBe('completed');
    // Both steps should have run (research before gate, strategist after approval)
    expect(agentService.run).toHaveBeenCalledTimes(2);
  });

  it('retries only on PROVIDER_ERROR/TIMEOUT and not on VALIDATION_ERROR', async () => {
    store.seedDefinition({
      slug: 'wf-retry',
      definition: {
        steps: [
          {
            id: 'research',
            agentId: 'research-agent',
            inputMapping: { type: 'static', value: {} },
            outputKey: 'research',
            retryPolicy: { maxAttempts: 3, backoffMs: 1 },
          },
        ],
        edges: [],
      },
    });

    // First call throws PROVIDER_ERROR, second succeeds
    let callCount = 0;
    const agentService = {
      run: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw shared.validationError('temp') as Error & { code?: string }; // we need PROVIDER_ERROR
          // Override below
        }
        return { output: { summary: 'ok' }, latencyMs: 10, model: 'm', provider: '9router' as const };
      }),
    };
    // Patch to throw PROVIDER_ERROR on first call
    agentService.run.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new shared.AppError('PROVIDER_ERROR', 'provider down', 502);
      return { output: { summary: 'ok' }, latencyMs: 10, model: 'm', provider: '9router' as const };
    });

    const engine = createEngine(agentService as unknown as AgentService);
    const id = await engine.execute('wf-retry', {}, { userId: 'u1', correlationId: 'c-retry' });
    await engine.processWorkflowJob(id);

    const exec = await store.getExecution(id);
    expect(exec.status).toBe('completed');
    expect(agentService.run).toHaveBeenCalledTimes(2);

    // Now validation error should NOT be retried
    store.seedDefinition({
      slug: 'wf-no-retry-validation',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'research', retryPolicy: { maxAttempts: 3, backoffMs: 1 } },
        ],
        edges: [],
      },
    });
    const agentService2 = {
      run: vi.fn().mockRejectedValue(new shared.AppError('VALIDATION_ERROR', 'bad output', 400)),
    };
    const engine2 = createEngine(agentService2 as unknown as AgentService);
    const id2 = await engine2.execute('wf-no-retry-validation', {}, { userId: 'u1', correlationId: 'c-no-retry' });
    await engine2.processWorkflowJob(id2);
    const exec2 = await store.getExecution(id2);
    expect(exec2.status).toBe('failed');
    expect(agentService2.run).toHaveBeenCalledTimes(1);
  });

  it('persists state[outputKey] after each step', async () => {
    store.seedDefinition({
      slug: 'wf-state',
      definition: {
        steps: [
          { id: 'research', agentId: 'research-agent', inputMapping: { type: 'static', value: {} }, outputKey: 'research' },
          { id: 'strategist', agentId: 'strategist-agent', inputMapping: { type: 'fromStepOutput', stepId: 'research', path: 'summary' }, outputKey: 'strategy' },
        ],
        edges: [{ from: 'research', to: 'strategist' }],
      },
    });

    const agentService = {
      run: vi.fn().mockImplementation(async (agentId: string, input: unknown) => {
        if (agentId === 'research-agent') return { output: { summary: 'btc up' }, latencyMs: 10, model: 'm', provider: '9router' as const };
        // strategist should receive resolved input containing 'btc up'
        expect(input).toBe('btc up');
        return { output: { angle: 'bullish' }, latencyMs: 10, model: 'm', provider: '9router' as const };
      }),
    };

    const engine = createEngine(agentService as unknown as AgentService);
    const id = await engine.execute('wf-state', {}, { userId: 'u1', correlationId: 'c-state' });
    await engine.processWorkflowJob(id);

    const exec = await store.getExecution(id);
    expect(exec.status).toBe('completed');
    expect(exec.state['research']).toEqual({ summary: 'btc up' });
    expect(exec.state['strategy']).toEqual({ angle: 'bullish' });
  });
});
