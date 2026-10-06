import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  unique,
} from 'drizzle-orm/pg-core';

// Phase 0 foundation: users + auth + migrations infrastructure
// Future phases extend this schema per docs/DATA-MODEL.md

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_email_idx').on(t.email)],
);

// Placeholder for future workflow/content entities — Phase 0 does not create them
// but we declare audit_events early for observability foundation.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: varchar('entity_id', { length: 100 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_events_created_at_idx').on(t.createdAt)],
);

// Dummy table to prove migration system works in Phase 0
export const appMeta = pgTable('app_meta', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Phase 2: Agent Runtime ───────────────────────────────────────────────
// Spec §9 — 8 tables: agent_definitions, agent_runs, workflow_definitions,
// workflow_executions, workflow_steps, approvals, tool_runs, agent_events
// All use uuid PK defaultRandom(), timestamptz notNull defaultNow() for createdAt.

export const agentDefinitions = pgTable(
  'agent_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 100 }).notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    role: varchar('role', { length: 200 }).notNull(),
    purpose: text('purpose').notNull(),
    inputSchema: jsonb('input_schema'),
    outputSchema: jsonb('output_schema'),
    allowedTools: text('allowed_tools').array(),
    systemPrompt: text('system_prompt').notNull(),
    promptVersion: varchar('prompt_version', { length: 200 }).notNull(),
    modelPolicy: varchar('model_policy', { length: 100 }).notNull(),
    config: jsonb('config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('agent_definitions_slug_version_unique').on(t.slug, t.version),
    index('agent_definitions_slug_idx').on(t.slug),
  ],
);

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 100 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    definition: jsonb('definition').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('workflow_definitions_slug_version_unique').on(t.slug, t.version),
    index('workflow_definitions_slug_idx').on(t.slug),
  ],
);

export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id),
    status: varchar('status', { length: 50 }).notNull(),
    input: jsonb('input'),
    state: jsonb('state'),
    error: jsonb('error'),
    correlationId: varchar('correlation_id', { length: 200 }),
    createdBy: uuid('created_by').references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workflow_executions_status_idx').on(t.status),
    index('workflow_executions_definition_idx').on(t.workflowDefinitionId),
    index('workflow_executions_correlation_id_idx').on(t.correlationId),
  ],
);

export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowExecutionId: uuid('workflow_execution_id')
      .notNull()
      .references(() => workflowExecutions.id),
    stepId: varchar('step_id', { length: 100 }).notNull(),
    agentDefinitionId: uuid('agent_definition_id').references(() => agentDefinitions.id),
    status: varchar('status', { length: 50 }).notNull(),
    attempt: integer('attempt').notNull().default(1),
    input: jsonb('input'),
    output: jsonb('output'),
    error: jsonb('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workflow_steps_execution_idx').on(t.workflowExecutionId),
    unique('workflow_steps_execution_step_attempt_unique').on(
      t.workflowExecutionId,
      t.stepId,
      t.attempt,
    ),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id),
    workflowExecutionId: uuid('workflow_execution_id').references(() => workflowExecutions.id),
    workflowStepId: uuid('workflow_step_id').references(() => workflowSteps.id),
    modelProvider: varchar('model_provider', { length: 50 }).notNull(),
    modelName: varchar('model_name', { length: 200 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 200 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    usageMetadata: jsonb('usage_metadata'),
    latencyMs: integer('latency_ms'),
    errorMetadata: jsonb('error_metadata'),
    correlationId: varchar('correlation_id', { length: 200 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_runs_definition_idx').on(t.agentDefinitionId),
    index('agent_runs_execution_idx').on(t.workflowExecutionId),
    index('agent_runs_correlation_id_idx').on(t.correlationId),
    index('agent_runs_created_at_idx').on(t.createdAt),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowExecutionId: uuid('workflow_execution_id')
      .notNull()
      .references(() => workflowExecutions.id),
    stepId: varchar('step_id', { length: 100 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    decidedBy: uuid('decided_by').references(() => users.id),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('approvals_execution_idx').on(t.workflowExecutionId),
    index('approvals_status_idx').on(t.status),
  ],
);

export const toolRuns = pgTable(
  'tool_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentRunId: uuid('agent_run_id')
      .notNull()
      .references(() => agentRuns.id),
    toolName: varchar('tool_name', { length: 100 }).notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    status: varchar('status', { length: 50 }).notNull(),
    latencyMs: integer('latency_ms'),
    error: jsonb('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tool_runs_agent_run_idx').on(t.agentRunId)],
);

export const agentEvents = pgTable(
  'agent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
    workflowExecutionId: uuid('workflow_execution_id').references(() => workflowExecutions.id),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_events_agent_run_idx').on(t.agentRunId),
    index('agent_events_execution_idx').on(t.workflowExecutionId),
  ],
);
