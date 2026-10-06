import { and, count, eq } from 'drizzle-orm';
import * as shared from '@kantorku/shared';
import {
  approvals,
  workflowDefinitions,
  workflowExecutions,
  workflowSteps,
} from '../../db/schema.js';
import type { Logger } from '../../logger.js';

// Re-exported types for engine consumption
export interface WorkflowExecution {
  id: string;
  workflowDefinitionId: string;
  status: string;
  input: unknown;
  state: Record<string, unknown>;
  error?: unknown;
  correlationId?: string;
  createdBy?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  steps: WorkflowStepRow[];
  approvals: ApprovalRow[];
}

export interface WorkflowStepRow {
  id: string;
  workflowExecutionId: string;
  stepId: string;
  agentDefinitionId?: string | null;
  status: string;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApprovalRow {
  id: string;
  workflowExecutionId: string;
  stepId: string;
  type: string;
  status: string;
  decidedBy?: string | null;
  reason?: string | null;
  createdAt: Date;
  decidedAt?: Date | null;
}

export interface ListExecutionsFilters {
  status?: string;
  workflowDefinitionId?: string;
  correlationId?: string;
  page?: number;
  pageSize?: number;
}

export interface WorkflowDefinitionRecord {
  id: string;
  slug: string;
  name: string;
  version: string;
  definition: {
    steps: Array<{
      id: string;
      agentId: string;
      inputMapping: unknown;
      outputKey: string;
      retryPolicy?: { maxAttempts: number; backoffMs: number };
      timeoutMs?: number;
    }>;
    edges: Array<{ from: string; to: string }>;
    approvalGates?: Array<{ stepId: string; type: 'script' | 'visual'; required: boolean }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ExecutionStore handles CRUD for workflow_definitions, workflow_executions,
 * workflow_steps, and approvals via drizzle. All methods trace with correlationId.
 */
export class ExecutionStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;
  private readonly logger: Logger;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  // ── Workflow Definitions ─────────────────────────────────────────────────

  async getDefinition(definitionId: string): Promise<WorkflowDefinitionRecord> {
    // Try by id first, then by slug
    let rows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, definitionId));

    if (rows.length === 0) {
      rows = await this.db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.slug, definitionId));
    }

    if (rows.length === 0) {
      throw shared.notFound(`Workflow definition not found: ${definitionId}`);
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      id: String(row['id']),
      slug: String(row['slug']),
      name: String(row['name']),
      version: String(row['version']),
      definition: (row['definition'] as WorkflowDefinitionRecord['definition']) ?? {
        steps: [],
        edges: [],
      },
      createdAt: row['createdAt'] instanceof Date ? (row['createdAt'] as Date) : new Date(),
      updatedAt: row['updatedAt'] instanceof Date ? (row['updatedAt'] as Date) : new Date(),
    };
  }

  async createDefinition(record: {
    slug: string;
    name: string;
    version: string;
    definition: WorkflowDefinitionRecord['definition'];
  }): Promise<string> {
    const result: Array<{ id: string }> = await this.db
      .insert(workflowDefinitions)
      .values({
        slug: record.slug,
        name: record.name,
        version: record.version,
        definition: record.definition,
      })
      .returning({ id: workflowDefinitions.id });

    const id = result[0]?.id;
    if (!id) throw new Error('Failed to create workflow definition');
    return id;
  }

  async listDefinitions(filters?: {
    slug?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: WorkflowDefinitionRecord[]; total: number }> {
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let whereClause: ReturnType<typeof eq> | undefined;
    if (filters?.slug) {
      whereClause = eq(workflowDefinitions.slug, filters.slug);
    }

    const totalRes: Array<Record<string, unknown>> = await this.db
      .select({ count: count() })
      .from(workflowDefinitions)
      .where(whereClause);

    const totalRaw = totalRes[0]?.['count'] ?? 0;
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw ?? 0);

    const dbRows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(workflowDefinitions)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset);

    const rows: WorkflowDefinitionRecord[] = dbRows.map((r) => ({
      id: String(r['id']),
      slug: String(r['slug']),
      name: String(r['name']),
      version: String(r['version']),
      definition: (r['definition'] as WorkflowDefinitionRecord['definition']) ?? {
        steps: [],
        edges: [],
      },
      createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : new Date(),
      updatedAt: r['updatedAt'] instanceof Date ? (r['updatedAt'] as Date) : new Date(),
    }));

    return { rows, total };
  }

  // ── Executions ───────────────────────────────────────────────────────────

  async createExecution(
    definitionId: string,
    input: unknown,
    userId: string,
    correlationId: string,
  ): Promise<string> {
    this.logger.debug({ definitionId, correlationId, userId }, 'executionStore.createExecution');

    const def = await this.getDefinition(definitionId);

    const execResult: Array<{ id: string }> = await this.db
      .insert(workflowExecutions)
      .values({
        workflowDefinitionId: def.id,
        status: 'running',
        input,
        state: {},
        correlationId,
        createdBy: userId,
        startedAt: new Date(),
      })
      .returning({ id: workflowExecutions.id });

    const executionId = execResult[0]?.id;
    if (!executionId) throw new Error('Failed to create workflow execution');

    // Create one workflow_steps row per step (status pending)
    for (const step of def.definition.steps) {
      await this.db.insert(workflowSteps).values({
        workflowExecutionId: executionId,
        stepId: step.id,
        // agentDefinitionId may be resolved later or left null; store as null for now
        agentDefinitionId: null,
        status: 'pending',
        attempt: 1,
        input: null,
        output: null,
        error: null,
      });
    }

    return executionId;
  }

  async getExecution(id: string): Promise<WorkflowExecution> {
    const execRows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, id));

    if (execRows.length === 0) {
      throw shared.notFound(`Workflow execution not found: ${id}`);
    }

    const row = execRows[0] as Record<string, unknown>;

    const stepRows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowExecutionId, id));

    const approvalRows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.workflowExecutionId, id));

    const stateRaw = row['state'] as Record<string, unknown> | null;
    const state: Record<string, unknown> =
      stateRaw && typeof stateRaw === 'object' && !Array.isArray(stateRaw)
        ? (stateRaw as Record<string, unknown>)
        : {};

    return {
      id: String(row['id']),
      workflowDefinitionId: String(row['workflowDefinitionId']),
      status: String(row['status']),
      input: row['input'],
      state,
      error: row['error'] ?? undefined,
      correlationId: row['correlationId'] ? String(row['correlationId']) : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : null,
      startedAt: row['startedAt'] instanceof Date ? (row['startedAt'] as Date) : null,
      completedAt: row['completedAt'] instanceof Date ? (row['completedAt'] as Date) : null,
      createdAt: row['createdAt'] instanceof Date ? (row['createdAt'] as Date) : new Date(),
      updatedAt: row['updatedAt'] instanceof Date ? (row['updatedAt'] as Date) : new Date(),
      steps: stepRows.map((r) => ({
        id: String(r['id']),
        workflowExecutionId: String(r['workflowExecutionId']),
        stepId: String(r['stepId']),
        agentDefinitionId: r['agentDefinitionId'] ? String(r['agentDefinitionId']) : null,
        status: String(r['status']),
        attempt: typeof r['attempt'] === 'number' ? (r['attempt'] as number) : 1,
        input: r['input'] ?? undefined,
        output: r['output'] ?? undefined,
        error: r['error'] ?? undefined,
        startedAt: r['startedAt'] instanceof Date ? (r['startedAt'] as Date) : null,
        completedAt: r['completedAt'] instanceof Date ? (r['completedAt'] as Date) : null,
        createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : undefined,
        updatedAt: r['updatedAt'] instanceof Date ? (r['updatedAt'] as Date) : undefined,
      })),
      approvals: approvalRows.map((r) => ({
        id: String(r['id']),
        workflowExecutionId: String(r['workflowExecutionId']),
        stepId: String(r['stepId']),
        type: String(r['type']),
        status: String(r['status']),
        decidedBy: r['decidedBy'] ? String(r['decidedBy']) : null,
        reason: r['reason'] ? String(r['reason']) : null,
        createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : new Date(),
        decidedAt: r['decidedAt'] instanceof Date ? (r['decidedAt'] as Date) : null,
      })),
    };
  }

  async updateStep(
    executionId: string,
    stepId: string,
    patch: Partial<{
      status: string;
      input: unknown;
      output: unknown;
      error: unknown;
      attempt: number;
      startedAt: Date | null;
      completedAt: Date | null;
      agentDefinitionId: string | null;
    }>,
  ): Promise<void> {
    this.logger.debug({ executionId, stepId, patchStatus: patch.status }, 'executionStore.updateStep');

    // Drizzle update with composite where: workflowExecutionId + stepId
    await this.db
      .update(workflowSteps)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowSteps.workflowExecutionId, executionId),
          eq(workflowSteps.stepId, stepId),
        ),
      );
  }

  async updateExecution(
    executionId: string,
    patch: Partial<{
      status: string;
      state: Record<string, unknown>;
      error: unknown;
      completedAt: Date | null;
      correlationId: string;
    }>,
  ): Promise<void> {
    this.logger.debug({ executionId, patchStatus: patch.status }, 'executionStore.updateExecution');

    const setValues: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date(),
    };
    // Map state to jsonb column
    await this.db
      .update(workflowExecutions)
      .set(setValues)
      .where(eq(workflowExecutions.id, executionId));
  }

  async listExecutions(
    filters: ListExecutionsFilters,
  ): Promise<{ rows: WorkflowExecution[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.status) conditions.push(eq(workflowExecutions.status, filters.status));
    if (filters.workflowDefinitionId)
      conditions.push(eq(workflowExecutions.workflowDefinitionId, filters.workflowDefinitionId));
    if (filters.correlationId)
      conditions.push(eq(workflowExecutions.correlationId, filters.correlationId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRes: Array<Record<string, unknown>> = await this.db
      .select({ count: count() })
      .from(workflowExecutions)
      .where(whereClause);

    const totalRaw = totalRes[0]?.['count'] ?? 0;
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw ?? 0);

    const dbRows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(workflowExecutions)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset);

    // For list, we return executions without eagerly loading steps/approvals (lightweight)
    // Fetch steps/approvals per execution would be expensive; tests use getExecution for full.
    const rows: WorkflowExecution[] = dbRows.map((r) => {
      const stateRaw = r['state'] as Record<string, unknown> | null;
      const state: Record<string, unknown> =
        stateRaw && typeof stateRaw === 'object' && !Array.isArray(stateRaw)
          ? (stateRaw as Record<string, unknown>)
          : {};
      return {
        id: String(r['id']),
        workflowDefinitionId: String(r['workflowDefinitionId']),
        status: String(r['status']),
        input: r['input'],
        state,
        error: r['error'] ?? undefined,
        correlationId: r['correlationId'] ? String(r['correlationId']) : undefined,
        createdBy: r['createdBy'] ? String(r['createdBy']) : null,
        startedAt: r['startedAt'] instanceof Date ? (r['startedAt'] as Date) : null,
        completedAt: r['completedAt'] instanceof Date ? (r['completedAt'] as Date) : null,
        createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : new Date(),
        updatedAt: r['updatedAt'] instanceof Date ? (r['updatedAt'] as Date) : new Date(),
        steps: [],
        approvals: [],
      };
    });

    return { rows, total };
  }

  // ── Approvals ────────────────────────────────────────────────────────────

  async createApproval(record: {
    workflowExecutionId: string;
    stepId: string;
    type: 'script' | 'visual';
    status?: string;
  }): Promise<string> {
    const result: Array<{ id: string }> = await this.db
      .insert(approvals)
      .values({
        workflowExecutionId: record.workflowExecutionId,
        stepId: record.stepId,
        type: record.type,
        status: record.status ?? 'pending',
      })
      .returning({ id: approvals.id });

    const id = result[0]?.id;
    if (!id) throw new Error('Failed to create approval');
    return id;
  }

  async getApproval(id: string): Promise<ApprovalRow> {
    const rows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.id, id));

    if (rows.length === 0) {
      throw shared.notFound(`Approval not found: ${id}`);
    }

    const r = rows[0] as Record<string, unknown>;
    return {
      id: String(r['id']),
      workflowExecutionId: String(r['workflowExecutionId']),
      stepId: String(r['stepId']),
      type: String(r['type']),
      status: String(r['status']),
      decidedBy: r['decidedBy'] ? String(r['decidedBy']) : null,
      reason: r['reason'] ? String(r['reason']) : null,
      createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : new Date(),
      decidedAt: r['decidedAt'] instanceof Date ? (r['decidedAt'] as Date) : null,
    };
  }

  async updateApproval(
    id: string,
    patch: Partial<{ status: string; decidedBy: string | null; reason: string | null; decidedAt: Date | null }>,
  ): Promise<void> {
    await this.db
      .update(approvals)
      .set(patch)
      .where(eq(approvals.id, id));
  }

  async listApprovals(workflowExecutionId: string): Promise<ApprovalRow[]> {
    const rows: Array<Record<string, unknown>> = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.workflowExecutionId, workflowExecutionId));

    return rows.map((r) => ({
      id: String(r['id']),
      workflowExecutionId: String(r['workflowExecutionId']),
      stepId: String(r['stepId']),
      type: String(r['type']),
      status: String(r['status']),
      decidedBy: r['decidedBy'] ? String(r['decidedBy']) : null,
      reason: r['reason'] ? String(r['reason']) : null,
      createdAt: r['createdAt'] instanceof Date ? (r['createdAt'] as Date) : new Date(),
      decidedAt: r['decidedAt'] instanceof Date ? (r['decidedAt'] as Date) : null,
    }));
  }
}
