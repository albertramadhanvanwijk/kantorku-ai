import { and, count, eq } from 'drizzle-orm';
import { agentRuns, toolRuns, agentEvents } from '../../db/schema.js';
import type { Logger } from '../../logger.js';

export interface AgentRunRecord {
  id: string;
  agentDefinitionId: string;
  workflowExecutionId?: string;
  workflowStepId?: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  status: 'completed' | 'failed';
  input: unknown;
  output?: unknown;
  usageMetadata?: unknown;
  latencyMs: number;
  errorMetadata?: unknown;
  correlationId: string;
  startedAt: Date;
  completedAt: Date;
}

export interface AgentRunQueryFilters {
  agentDefinitionId?: string;
  workflowExecutionId?: string;
  correlationId?: string;
  page?: number;
  pageSize?: number;
}

function toAgentRunRecord(row: Record<string, unknown>): AgentRunRecord {
  return {
    id: String(row['id']),
    agentDefinitionId: String(row['agentDefinitionId']),
    workflowExecutionId: row['workflowExecutionId'] ? String(row['workflowExecutionId']) : undefined,
    workflowStepId: row['workflowStepId'] ? String(row['workflowStepId']) : undefined,
    modelProvider: String(row['modelProvider']),
    modelName: String(row['modelName']),
    promptVersion: String(row['promptVersion']),
    status: row['status'] as 'completed' | 'failed',
    input: row['input'],
    output: row['output'] ?? undefined,
    usageMetadata: row['usageMetadata'] ?? undefined,
    latencyMs: typeof row['latencyMs'] === 'number' ? (row['latencyMs'] as number) : 0,
    errorMetadata: row['errorMetadata'] ?? undefined,
    correlationId: row['correlationId'] ? String(row['correlationId']) : '',
    startedAt: row['startedAt'] instanceof Date ? (row['startedAt'] as Date) : new Date(0),
    completedAt: row['completedAt'] instanceof Date ? (row['completedAt'] as Date) : new Date(0),
  };
}

/**
 * RunLogger persists agent_runs, tool_runs, agent_events and provides
 * paginated query for agent_runs. All methods log at debug with correlationId
 * and never log secrets (input/output/payload are never logged).
 */
export class RunLogger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;
  private readonly logger: Logger;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async logAgentRun(rec: Omit<AgentRunRecord, 'id'>): Promise<string> {
    this.logger.debug(
      {
        correlationId: rec.correlationId,
        agentDefinitionId: rec.agentDefinitionId,
        status: rec.status,
        modelProvider: rec.modelProvider,
        modelName: rec.modelName,
      },
      'runLogger.logAgentRun',
    );

    const values = {
      agentDefinitionId: rec.agentDefinitionId,
      workflowExecutionId: rec.workflowExecutionId ?? null,
      workflowStepId: rec.workflowStepId ?? null,
      modelProvider: rec.modelProvider,
      modelName: rec.modelName,
      promptVersion: rec.promptVersion,
      status: rec.status,
      input: rec.input,
      output: rec.output ?? null,
      usageMetadata: rec.usageMetadata ?? null,
      latencyMs: rec.latencyMs,
      errorMetadata: rec.errorMetadata ?? null,
      correlationId: rec.correlationId,
      startedAt: rec.startedAt,
      completedAt: rec.completedAt,
    };

    const result: Array<{ id: string }> = await this.db
      .insert(agentRuns)
      .values(values)
      .returning({ id: agentRuns.id });

    const id = result[0]?.id;
    if (!id) {
      throw new Error('Failed to insert agent_run: no id returned');
    }
    return id;
  }

  async logToolRun(
    agentRunId: string,
    toolName: string,
    input: unknown,
    output: unknown,
    latencyMs: number,
    status: string,
  ): Promise<string> {
    this.logger.debug({ agentRunId, toolName, status }, 'runLogger.logToolRun');

    const values = {
      agentRunId,
      toolName,
      input,
      output,
      status,
      latencyMs,
    };

    const result: Array<{ id: string }> = await this.db
      .insert(toolRuns)
      .values(values)
      .returning({ id: toolRuns.id });

    const id = result[0]?.id;
    if (!id) {
      throw new Error('Failed to insert tool_run: no id returned');
    }
    return id;
  }

  async logAgentEvent(event: {
    agentRunId?: string;
    workflowExecutionId?: string;
    eventType: string;
    payload: unknown;
  }): Promise<string> {
    // Log correlation via agentRunId/workflowExecutionId but never payload
    this.logger.debug(
      {
        agentRunId: event.agentRunId,
        workflowExecutionId: event.workflowExecutionId,
        eventType: event.eventType,
      },
      'runLogger.logAgentEvent',
    );

    const values = {
      agentRunId: event.agentRunId ?? null,
      workflowExecutionId: event.workflowExecutionId ?? null,
      eventType: event.eventType,
      payload: event.payload,
    };

    const result: Array<{ id: string }> = await this.db
      .insert(agentEvents)
      .values(values)
      .returning({ id: agentEvents.id });

    const id = result[0]?.id;
    if (!id) {
      throw new Error('Failed to insert agent_event: no id returned');
    }
    return id;
  }

  async queryAgentRuns(
    filters: AgentRunQueryFilters,
  ): Promise<{ rows: AgentRunRecord[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSizeRaw = filters.pageSize ?? 20;
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
    const offset = (page - 1) * pageSize;

    this.logger.debug(
      {
        correlationId: filters.correlationId,
        agentDefinitionId: filters.agentDefinitionId,
        workflowExecutionId: filters.workflowExecutionId,
        page,
        pageSize,
      },
      'runLogger.queryAgentRuns',
    );

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.agentDefinitionId) {
      conditions.push(eq(agentRuns.agentDefinitionId, filters.agentDefinitionId));
    }
    if (filters.workflowExecutionId) {
      conditions.push(eq(agentRuns.workflowExecutionId, filters.workflowExecutionId));
    }
    if (filters.correlationId) {
      conditions.push(eq(agentRuns.correlationId, filters.correlationId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalRes: Array<Record<string, unknown>> = await (this.db as any)
      .select({ count: count() })
      .from(agentRuns)
      .where(whereClause);

    const totalRaw = totalRes[0]?.['count'] ?? totalRes[0]?.['total'] ?? 0;
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw ?? 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbRows: Array<Record<string, unknown>> = await (this.db as any)
      .select()
      .from(agentRuns)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset);

    const rows = dbRows.map((r) => toAgentRunRecord(r as Record<string, unknown>));

    return { rows, total };
  }
}
