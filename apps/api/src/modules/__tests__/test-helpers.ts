import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const { Pool } = pg;

/**
 * Creates a fake pg Pool that uses an in-memory Drizzle database for testing.
 * This avoids the need for a real PostgreSQL instance during tests.
 */
export function createFakePgPool(): InstanceType<typeof Pool> {
  // In-memory stores for each table
  const stores: Record<string, Map<string, Record<string, unknown>>> = {
    users: new Map(),
    workflow_definitions: new Map(),
    workflow_executions: new Map(),
    workflow_steps: new Map(),
    approvals: new Map(),
    agent_runs: new Map(),
    tool_runs: new Map(),
    agent_events: new Map(),
    audit_events: new Map(),
  };

  let idCounter = 1000;
  const nextId = () => `00000000-0000-4000-a000-${String(idCounter++).padStart(12, '0')}`;

  // Seed default workflow definition
  const defaultWorkflow = {
    id: '00000000-0000-4000-a000-000000000001',
    slug: 'content-production-v1',
    name: 'Content Production v1',
    version: '1.0.0',
    definition: {
      steps: [
        {
          id: 'research',
          agentId: 'research-agent',
          inputMapping: { type: 'fromWorkflowInput', path: '' },
          outputKey: 'research',
        },
        {
          id: 'strategist',
          agentId: 'content-strategist-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              research: { type: 'fromStepOutput', stepId: 'research', path: '' },
              contentCategory: { type: 'fromWorkflowInput', path: 'contentCategory' },
              brandVoice: { type: 'fromWorkflowInput', path: 'brandVoice' },
            },
          },
          outputKey: 'strategy',
        },
        {
          id: 'copywriter',
          agentId: 'copywriter-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              strategy: { type: 'fromStepOutput', stepId: 'strategist', path: '' },
              template: { type: 'fromWorkflowInput', path: 'template' },
              tradingDna: { type: 'fromWorkflowInput', path: 'tradingDna' },
            },
          },
          outputKey: 'copy',
        },
      ],
      edges: [
        { from: 'research', to: 'strategist' },
        { from: 'strategist', to: 'copywriter' },
      ],
      approvalGates: [],
    },
    created_at: new Date(),
    updated_at: new Date(),
  };
  // Store with snake_case keys to match pg driver output
  stores.workflow_definitions.set(defaultWorkflow.id, defaultWorkflow as Record<string, unknown>);
  stores.workflow_definitions.set(defaultWorkflow.slug, defaultWorkflow as Record<string, unknown>);

  // Create a mock pool with a query method that handles our fake data
  const mockPool = {
    query: async (queryObj: { text: string; values?: unknown[] } | string, params?: unknown[]) => {
      // Handle both Drizzle's query object format and raw SQL string format
      let text: string;
      let values: unknown[];
      if (typeof queryObj === 'string') {
        text = queryObj;
        values = params ?? [];
      } else {
        text = queryObj.text;
        // Drizzle sometimes passes values in the second argument (params) instead of queryObj.values
        values = (queryObj.values && queryObj.values.length > 0) ? queryObj.values : (params ?? []);
      }
      
      // DEBUG: Log the query
      console.log('[FAKE POOL QUERY]', text, values);
      
      // Very basic SQL parsing for our test needs
      const lowerText = text.toLowerCase().trim();
      
      // Helper to create pg-style fields array
      const createFields = (columnNames: string[]) => columnNames.map(name => ({ name, dataTypeID: 0, dataTypeSize: 0, dataTypeModifier: -1, format: 'text' }));

      // SELECT from workflow_definitions
      if (lowerText.includes('workflow_definitions') && lowerText.includes('select')) {
        // Check for WHERE clause with slug or id (more specific to avoid matching SELECT columns)
        const whereClause = lowerText.substring(lowerText.indexOf('where'));
        const workflowDefColumns = ['id', 'slug', 'name', 'version', 'definition', 'created_at', 'updated_at'];
        if (whereClause.includes('slug') && values) {
          const slug = values[0] as string;
          const row = stores.workflow_definitions.get(slug);
          if (row) {
            const resultRow = {
              id: row.id,
              slug: row.slug,
              name: row.name,
              version: row.version,
              definition: row.definition,
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
            console.log('[FAKE POOL] workflow_definitions by slug:', slug, '->', { id: resultRow.id, keys: Object.keys(resultRow) });
            return { rows: [resultRow], rowCount: 1, fields: createFields(workflowDefColumns) };
          }
          return { rows: [], rowCount: 0, fields: createFields(workflowDefColumns) };
        }
        if (whereClause.includes('"id"') && values) {
          const id = values[0] as string;
          const row = stores.workflow_definitions.get(id);
          if (row) {
            const resultRow = {
              id: row.id,
              slug: row.slug,
              name: row.name,
              version: row.version,
              definition: row.definition,
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
            console.log('[FAKE POOL] workflow_definitions by id:', id, '->', { id: resultRow.id, keys: Object.keys(resultRow) });
            return { rows: [resultRow], rowCount: 1, fields: createFields(workflowDefColumns) };
          }
          return { rows: [], rowCount: 0, fields: createFields(workflowDefColumns) };
        }
        // Return all (deduplicated by id)
        const seen = new Set<string>();
        const rows: Record<string, unknown>[] = [];
        for (const [key, val] of stores.workflow_definitions.entries()) {
          if (key.length === 36 && !seen.has(key)) { // UUID keys only
            seen.add(key);
            const v = val as Record<string, unknown>;
            rows.push({
              id: v.id,
              slug: v.slug,
              name: v.name,
              version: v.version,
              definition: v.definition,
              created_at: v.created_at,
              updated_at: v.updated_at,
            });
          }
        }
        return { rows, rowCount: rows.length, fields: createFields(workflowDefColumns) };
      }

      // INSERT into workflow_definitions
      if (lowerText.includes('workflow_definitions') && lowerText.includes('insert')) {
        // This is a simplified mock - in reality we'd parse the values
        const id = nextId();
        const row = { id, ...values, createdAt: new Date(), updatedAt: new Date() };
        stores.workflow_definitions.set(id, row);
        return { rows: [{ id }], rowCount: 1 };
      }

      // SELECT from workflow_executions
      if (lowerText.includes('workflow_executions') && lowerText.includes('select')) {
        if ((lowerText.includes('where') && (lowerText.includes('"id"') || lowerText.includes('id'))) && values) {
          const id = values[0] as string;
          const row = stores.workflow_executions.get(id);
          return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
        }
        const rows = Array.from(stores.workflow_executions.values());
        return { rows, rowCount: rows.length };
      }

      // INSERT into workflow_executions
      if (lowerText.includes('workflow_executions') && lowerText.includes('insert')) {
        const id = nextId();
        const row = { 
          id, 
          workflowDefinitionId: values?.[0],
          status: 'running',
          input: values?.[1],
          state: {},
          error: null,
          correlationId: values?.[2],
          createdBy: values?.[3],
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        stores.workflow_executions.set(id, row);
        
        // Create step rows for the workflow
        const def = stores.workflow_definitions.get(row.workflowDefinitionId as string);
        if (def) {
          const steps = (def.definition as Record<string, unknown>).steps as Array<{id: string; agentId: string; inputMapping: unknown; outputKey: string}>;
          for (const step of steps) {
            const stepId = nextId();
            stores.workflow_steps.set(stepId, {
              id: stepId,
              workflowExecutionId: id,
              stepId: step.id,
              agentDefinitionId: null,
              status: 'pending',
              attempt: 1,
              input: null,
              output: null,
              error: null,
              startedAt: null,
              completedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        return { rows: [{ id }], rowCount: 1 };
      }

      // UPDATE workflow_executions
      if (lowerText.includes('workflow_executions') && lowerText.includes('update')) {
        if (values && values.length > 0) {
          const id = values[values.length - 1] as string;
          const row = stores.workflow_executions.get(id);
          if (row) {
            // Update fields from values (simplified)
            Object.assign(row, { updatedAt: new Date() });
          }
        }
        return { rows: [], rowCount: 1 };
      }

      // SELECT from workflow_steps
      if (lowerText.includes('workflow_steps') && lowerText.includes('select')) {
        if (lowerText.includes('where workflow_execution_id') && values) {
          const execId = values[0] as string;
          const rows = Array.from(stores.workflow_steps.values()).filter(
            (r) => r.workflowExecutionId === execId
          );
          return { rows, rowCount: rows.length };
        }
        const rows = Array.from(stores.workflow_steps.values());
        return { rows, rowCount: rows.length };
      }

      // UPDATE workflow_steps
      if (lowerText.includes('workflow_steps') && lowerText.includes('update')) {
        if (values && values.length > 0) {
          // Simplified - find step by workflowExecutionId and stepId
          const execId = values[values.length - 2] as string;
          const stepId = values[values.length - 1] as string;
          for (const [key, row] of stores.workflow_steps.entries()) {
            if (row.workflowExecutionId === execId && row.stepId === stepId) {
              Object.assign(row, { updatedAt: new Date() });
              break;
            }
          }
        }
        return { rows: [], rowCount: 1 };
      }

      // SELECT from approvals
      if (lowerText.includes('approvals') && lowerText.includes('select')) {
        if (lowerText.includes('where workflow_execution_id') && values) {
          const execId = values[0] as string;
          const rows = Array.from(stores.approvals.values()).filter(
            (r) => r.workflowExecutionId === execId
          );
          return { rows, rowCount: rows.length };
        }
        if (lowerText.includes('where id') && values) {
          const id = values[0] as string;
          const row = stores.approvals.get(id);
          return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
        }
        const rows = Array.from(stores.approvals.values());
        return { rows, rowCount: rows.length };
      }

      // INSERT into approvals
      if (lowerText.includes('approvals') && lowerText.includes('insert')) {
        const id = nextId();
        const row = {
          id,
          workflowExecutionId: values?.[0],
          stepId: values?.[1],
          type: values?.[2],
          status: 'pending',
          decidedBy: null,
          reason: null,
          createdAt: new Date(),
          decidedAt: null,
        };
        stores.approvals.set(id, row);
        return { rows: [{ id }], rowCount: 1 };
      }

      // UPDATE approvals
      if (lowerText.includes('approvals') && lowerText.includes('update')) {
        if (values && values.length > 0) {
          const id = values[values.length - 1] as string;
          const row = stores.approvals.get(id);
          if (row) {
            Object.assign(row, { updatedAt: new Date() });
          }
        }
        return { rows: [], rowCount: 1 };
      }

      // SELECT from agent_runs
      if (lowerText.includes('agent_runs') && lowerText.includes('select')) {
        if (lowerText.includes('where correlation_id') && values) {
          const corrId = values[0] as string;
          const rows = Array.from(stores.agent_runs.values()).filter(
            (r) => r.correlationId === corrId
          );
          return { rows, rowCount: rows.length };
        }
        if (lowerText.includes('where id') && values) {
          const id = values[0] as string;
          const row = stores.agent_runs.get(id);
          return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
        }
        const rows = Array.from(stores.agent_runs.values());
        return { rows, rowCount: rows.length };
      }

      // INSERT into agent_runs
      if (lowerText.includes('agent_runs') && lowerText.includes('insert')) {
        const id = nextId();
        const row = {
          id,
          agentDefinitionId: values?.[0],
          modelProvider: values?.[1],
          modelName: values?.[2],
          promptVersion: values?.[3],
          status: values?.[4],
          input: values?.[5],
          output: values?.[6],
          error: values?.[7],
          latencyMs: values?.[8],
          tokensUsed: values?.[9] ?? 0,
          correlationId: values?.[10],
          workflowExecutionId: values?.[11] ?? null,
          stepId: values?.[12] ?? null,
          startedAt: values?.[13],
          completedAt: values?.[14],
          createdAt: new Date(),
        };
        stores.agent_runs.set(id, row);
        return { rows: [{ id }], rowCount: 1 };
      }

      // Default empty result
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    }),
    end: async () => {},
    on: () => {},
  } as unknown as InstanceType<typeof Pool>;

  return mockPool;
}

/**
 * Creates a fake Drizzle-like database instance for testing.
 * This avoids the need for a real PostgreSQL instance during tests.
 */
export function createFakeDb() {
  // Store for workflow_definitions / executions / steps / approvals / agent_runs
  const defs = new Map<string, Record<string, unknown>>();
  const execs = new Map<string, Record<string, unknown>>();
  const steps = new Map<string, Record<string, unknown>[]>();
  const approvalStore = new Map<string, Record<string, unknown>>();
  const runStore: Record<string, unknown>[] = [];

  let counter = 1000;
  const nextId = () => `00000000-0000-4000-a000-${String(counter++).padStart(12, '0')}`;

  // Pre-seed workflow definition matching content-production-v1 (3 steps: research → strategist → copywriter)
  const seedDef = {
    id: '00000000-0000-4000-a000-000000000001',
    slug: 'content-production-v1',
    name: 'Content Production v1',
    version: '1.0.0',
    definition: {
      steps: [
        {
          id: 'research',
          agentId: 'research-agent',
          inputMapping: { type: 'fromWorkflowInput', path: '' },
          outputKey: 'research',
        },
        {
          id: 'strategist',
          agentId: 'content-strategist-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              research: { type: 'fromStepOutput', stepId: 'research', path: '' },
              contentCategory: { type: 'fromWorkflowInput', path: 'contentCategory' },
              brandVoice: { type: 'fromWorkflowInput', path: 'brandVoice' },
            },
          },
          outputKey: 'strategy',
        },
        {
          id: 'copywriter',
          agentId: 'copywriter-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              strategy: { type: 'fromStepOutput', stepId: 'strategist', path: '' },
              template: { type: 'fromWorkflowInput', path: 'template' },
              tradingDna: { type: 'fromWorkflowInput', path: 'tradingDna' },
            },
          },
          outputKey: 'copy',
        },
      ],
      edges: [
        { from: 'research', to: 'strategist' },
        { from: 'strategist', to: 'copywriter' },
      ],
      approvalGates: [], // No gates for happy path
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  defs.set(seedDef.id, seedDef as unknown as Record<string, unknown>);
  defs.set(seedDef.slug, seedDef as unknown as Record<string, unknown>);

  // Seed an execution for executions/:id tests
  const seedExecId = '00000000-0000-4000-a000-000000000099';
  execs.set(seedExecId, {
    id: seedExecId,
    workflowDefinitionId: seedDef.id,
    status: 'waiting_approval',
    input: { query: 'BTC outlook' },
    state: { research: { summary: 'btc up' } },
    error: null,
    correlationId: 'corr-seed-1',
    createdBy: 'user-1',
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  steps.set(seedExecId, [
    {
      id: nextId(),
      workflowExecutionId: seedExecId,
      stepId: 'research',
      agentDefinitionId: null,
      status: 'completed',
      attempt: 1,
      input: { query: 'BTC outlook' },
      output: { summary: 'btc up' },
      error: null,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    {
      id: nextId(),
      workflowExecutionId: seedExecId,
      stepId: 'strategist',
      agentDefinitionId: null,
      status: 'pending',
      attempt: 1,
      input: null,
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
    },
  ]);
  const seedApprovalId = '00000000-0000-4000-a000-000000000050';
  approvalStore.set(seedApprovalId, {
    id: seedApprovalId,
    workflowExecutionId: seedExecId,
    stepId: 'strategist',
    type: 'script',
    status: 'pending',
    decidedBy: null,
    reason: null,
    createdAt: new Date(),
    decidedAt: null,
  });

  // Helper to perform the actual insert
  const doInsert = (tableName: string, arr: Record<string, unknown>[], projKey?: string) => {
    const results: Record<string, unknown>[] = [];
    for (const v of arr) {
      const id = nextId();
      if (tableName === 'workflow_definitions') {
        const row = { id, ...v, createdAt: new Date(), updatedAt: new Date() };
        defs.set(id, row as Record<string, unknown>);
        if (typeof v['slug'] === 'string') defs.set(String(v['slug']), row as Record<string, unknown>);
        results.push({ [projKey ?? 'id']: id });
      } else if (tableName === 'workflow_executions') {
        const row = { id, ...v, createdAt: new Date(), updatedAt: new Date() };
        execs.set(id, row as Record<string, unknown>);
        results.push({ [projKey ?? 'id']: id });
      } else if (tableName === 'workflow_steps') {
        const row = { id, ...v, createdAt: new Date(), updatedAt: new Date() };
        const execId = String(v['workflowExecutionId']);
        const existing = steps.get(execId) ?? [];
        existing.push(row as Record<string, unknown>);
        steps.set(execId, existing);
        results.push({ [projKey ?? 'id']: id });
      } else if (tableName === 'approvals') {
        const row = { id, ...v, createdAt: new Date(), decidedAt: null };
        approvalStore.set(id, row as Record<string, unknown>);
        results.push({ [projKey ?? 'id']: id });
      } else if (tableName === 'agent_runs') {
        const row = { id, ...v, createdAt: new Date() };
        runStore.push(row as Record<string, unknown>);
        results.push({ [projKey ?? 'id']: id });
      } else if (tableName === 'tool_runs' || tableName === 'agent_events') {
        const row = { id, ...v, createdAt: new Date() };
        results.push({ [projKey ?? 'id']: id });
      } else {
        results.push({ [projKey ?? 'id']: id });
      }
    }
    return results;
  };

  // Drizzle-like fake that handles the tables used by ExecutionStore and RunLogger and runs.routes
  const fakeDb: unknown = {
    _defs: defs,
    _execs: execs,
    _steps: steps,
    _approvalStore: approvalStore,
    _runStore: runStore,
    _nextId: nextId,

    insert(table: unknown) {
      const tableName = getTableName(table);
      return {
        values(vals: Record<string, unknown> | Record<string, unknown>[]) {
          const arr = Array.isArray(vals) ? vals : [vals];
          
          // Return a query object that executes on await or on .returning()
          let executed = false;
          let executionResults: Record<string, unknown>[] = [];
          
          const execute = (projKey?: string) => {
            if (!executed) {
              executionResults = doInsert(tableName, arr, projKey);
              executed = true;
            }
            return executionResults;
          };
          
          const queryPromise = {
            then(onfulfilled: (v: Record<string, unknown>[]) => unknown) {
              return Promise.resolve(execute()).then(onfulfilled);
            },
            returning(proj: Record<string, unknown>) {
              const projKey = Object.keys(proj)[0] as string | undefined;
              return Promise.resolve(execute(projKey));
            },
          };
          
          return queryPromise;
        },
      };
    },

    select(proj?: unknown) {
      const isCount = proj !== undefined && proj !== null && typeof proj === 'object' && 'count' in (proj as Record<string, unknown>);
      return {
        from(table: unknown) {
          const tableName = getTableName(table);
          const builder: Record<string, unknown> = {
            limit(n: number) {
              return {
                offset(o: number) {
                  if (tableName === 'workflow_definitions') {
                    const seen = new Set<string>();
                    const rows: Record<string, unknown>[] = [];
                    for (const v of defs.values()) {
                      const id = String((v as Record<string, unknown>)['id']);
                      if (!seen.has(id)) {
                        seen.add(id);
                        rows.push(v as Record<string, unknown>);
                      }
                    }
                    return Promise.resolve(rows.slice(o, o + n));
                  } else if (tableName === 'workflow_executions') {
                    const rows = Array.from(execs.values());
                    return Promise.resolve(rows.slice(o, o + n));
                  } else if (tableName === 'agent_runs') {
                    return Promise.resolve(runStore.slice(o, o + n));
                  } else if (tableName === 'workflow_steps') {
                    return Promise.resolve([]);
                  } else if (tableName === 'approvals') {
                    return Promise.resolve(Array.from(approvalStore.values()).slice(o, o + n));
                  }
                  return Promise.resolve([]);
                },
              };
            },
          };
          return {
            where(cond?: unknown) {
              if (isCount) {
                let countVal = 0;
                if (tableName === 'workflow_definitions') countVal = Array.from(defs.values()).filter((_, i) => i % 2 === 0).length; // crude but we store dup id+slug; dedupe
                else if (tableName === 'workflow_executions') countVal = execs.size;
                else if (tableName === 'agent_runs') countVal = runStore.length;
                else if (tableName === 'workflow_steps') {
                  // count all steps rows
                  let c = 0;
                  for (const arr of steps.values()) c += arr.length;
                  countVal = c;
                } else if (tableName === 'approvals') countVal = approvalStore.size;
                // Dedupe workflow_definitions: only count id-keyed entries (UUID length 36)
                if (tableName === 'workflow_definitions') {
                  const uuids = Array.from(defs.keys()).filter((k) => k.length === 36);
                  countVal = uuids.length;
                }
                return Promise.resolve([{ count: countVal }]);
              }
              // Return builder with limit/offset for list queries
              const builder: Record<string, unknown> = {
                limit(n: number) {
                  return {
                    offset(o: number) {
                      if (tableName === 'workflow_definitions') {
                        // return unique defs (dedup by id)
                        const seen = new Set<string>();
                        const rows: Record<string, unknown>[] = [];
                        for (const v of defs.values()) {
                          const id = String((v as Record<string, unknown>)['id']);
                          if (!seen.has(id)) {
                            seen.add(id);
                            rows.push(v as Record<string, unknown>);
                          }
                        }
                        return Promise.resolve(rows.slice(o, o + n));
                      } else if (tableName === 'workflow_executions') {
                        const rows = Array.from(execs.values());
                        return Promise.resolve(rows.slice(o, o + n));
                      } else if (tableName === 'agent_runs') {
                        return Promise.resolve(runStore.slice(o, o + n));
                      } else if (tableName === 'workflow_steps') {
                        // not used for list
                        return Promise.resolve([]);
                      } else if (tableName === 'approvals') {
                        return Promise.resolve(Array.from(approvalStore.values()).slice(o, o + n));
                      }
                      return Promise.resolve([]);
                    },
                  };
                },
              };
              // For get-by-id style queries (select().from().where() without limit/offset):
              // Try to extract filter value from Drizzle eq() condition for known tables.
              if (tableName === 'workflow_definitions') {
                // Try to extract filter from condition - Drizzle eq() returns a SQL object with queryChunks
                let filterValue: string | null = null;
                let filterField: 'id' | 'slug' | null = null;
                
                // Handle Drizzle SQL object (has queryChunks array)
                if (cond && typeof cond === 'object' && 'queryChunks' in cond) {
                  const sql = cond as { queryChunks: unknown[] };
                  console.log('[FAKE DB] SQL queryChunks:', sql.queryChunks.map(c => c?.constructor?.name));
                  
                  // Find the column chunk (PgUUID for id, PgVarchar for slug) to determine field
                  let columnName: string | null = null;
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'name' in chunk && typeof (chunk as Record<string, unknown>).name === 'string') {
                      columnName = (chunk as Record<string, unknown>).name as string;
                      console.log('[FAKE DB] Found column chunk:', columnName);
                      break;
                    }
                  }
                  
                  // Find the Param chunk which contains the value
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'constructor' in chunk && chunk.constructor?.name === 'Param') {
                      const param = chunk as { value: unknown };
                      console.log('[FAKE DB] Found Param chunk:', param.value);
                      if (typeof param.value === 'string') {
                        filterValue = param.value;
                        break;
                      }
                    }
                  }
                  
                  // Determine field from the column name
                  if (columnName === 'id') filterField = 'id';
                  else if (columnName === 'slug') filterField = 'slug';
                  else if (filterValue) {
                    // Fallback: if filterValue looks like a UUID, assume it's id, else slug
                    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filterValue)) {
                      filterField = 'id';
                    } else {
                      filterField = 'slug';
                    }
                  }
                }
                // Handle plain object with operator (fallback)
                else if (cond && typeof cond === 'object' && 'operator' in cond && (cond as Record<string, unknown>).operator === '=') {
                  const c = cond as Record<string, unknown>;
                  if (c.right && typeof c.right === 'string') {
                    filterValue = c.right;
                    if (c.left && typeof c.left === 'object' && 'name' in c.left) {
                      const leftName = String((c.left as Record<string, unknown>).name);
                      if (leftName === 'id') filterField = 'id';
                      else if (leftName === 'slug') filterField = 'slug';
                    }
                  }
                }
                // DEBUG
                console.log('[FAKE DB] workflow_definitions where:', { filterField, filterValue });
                
                const seen = new Set<string>();
                const rows: Record<string, unknown>[] = [];
                for (const v of defs.values()) {
                  const id = String((v as Record<string, unknown>)['id']);
                  if (!seen.has(id)) {
                    seen.add(id);
                    // Apply filter if we have one
                    if (filterValue && filterField) {
                      const fieldValue = String((v as Record<string, unknown>)[filterField]);
                      if (fieldValue !== filterValue) continue;
                    }
                    rows.push(v as Record<string, unknown>);
                  }
                }
                console.log('[FAKE DB] workflow_definitions returning:', rows.length, 'rows');
                // Return as a thenable with limit/offset shim
                const promise = Promise.resolve(rows);
                return Object.assign(promise, builder);
              }
              if (tableName === 'workflow_executions') {
                // Try to extract filter from condition - Drizzle eq() returns a SQL object with queryChunks
                let filterValue: string | null = null;
                
                // Handle Drizzle SQL object (has queryChunks array)
                if (cond && typeof cond === 'object' && 'queryChunks' in cond) {
                  const sql = cond as { queryChunks: unknown[] };
                  console.log('[FAKE DB] SQL queryChunks for workflow_executions:', sql.queryChunks.map(c => c?.constructor?.name));
                  
                  // Find the column chunk (PgUUID for id) to determine field
                  let columnName: string | null = null;
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'name' in chunk && typeof (chunk as Record<string, unknown>).name === 'string') {
                      columnName = (chunk as Record<string, unknown>).name as string;
                      console.log('[FAKE DB] Found column chunk for workflow_executions:', columnName);
                      break;
                    }
                  }
                  
                  // Find the Param chunk which contains the value
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'constructor' in chunk && chunk.constructor?.name === 'Param') {
                      const param = chunk as { value: unknown };
                      console.log('[FAKE DB] Found Param chunk for workflow_executions:', param.value);
                      if (typeof param.value === 'string') {
                        filterValue = param.value;
                        break;
                      }
                    }
                  }
                  
                  // Validate field is 'id'
                  if (columnName !== 'id' && filterValue) {
                    console.log('[FAKE DB] Warning: workflow_executions filter not on id column:', columnName);
                  }
                }
                // Handle plain object with operator (fallback)
                else if (cond && typeof cond === 'object' && 'operator' in cond && (cond as Record<string, unknown>).operator === '=') {
                  const c = cond as Record<string, unknown>;
                  if (c.right && typeof c.right === 'string') {
                    filterValue = c.right;
                    if (c.left && typeof c.left === 'object' && 'name' in c.left) {
                      const leftName = String((c.left as Record<string, unknown>).name);
                      if (leftName !== 'id') {
                        console.log('[FAKE DB] Warning: workflow_executions filter not on id column:', leftName);
                      }
                    }
                  }
                }
                
                // DEBUG
                console.log('[FAKE DB] workflow_executions where:', { filterValue });
                
                const rows = Array.from(execs.values()).filter(
                  (v) => !filterValue || String((v as Record<string, unknown>)['id']) === filterValue
                );
                const promise = Promise.resolve(rows);
                return Object.assign(promise, builder);
              }
              if (tableName === 'workflow_steps') {
                // Try to extract filter from condition for workflowExecutionId
                let filterExecId: string | null = null;
                
                // Handle Drizzle SQL object (has queryChunks array)
                if (cond && typeof cond === 'object' && 'queryChunks' in cond) {
                  const sql = cond as { queryChunks: unknown[] };
                  console.log('[FAKE DB] SQL queryChunks for workflow_steps:', sql.queryChunks.map(c => c?.constructor?.name));
                  
                  // Find the Param chunk which contains the value (execution ID)
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'constructor' in chunk && chunk.constructor?.name === 'Param') {
                      const param = chunk as { value: unknown };
                      console.log('[FAKE DB] Found Param chunk for workflow_steps:', param.value);
                      if (typeof param.value === 'string') {
                        filterExecId = param.value;
                        break;
                      }
                    }
                  }
                  
                  // Also try to find the column chunk to validate it's workflowExecutionId
                  let columnName: string | null = null;
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'name' in chunk && typeof (chunk as Record<string, unknown>).name === 'string') {
                      columnName = (chunk as Record<string, unknown>).name as string;
                      console.log('[FAKE DB] Found column chunk for workflow_steps:', columnName);
                      // Don't break - keep looking for workflowExecutionId column
                      if (columnName === 'workflowExecutionId' || columnName === 'workflow_execution_id') {
                        break;
                      }
                    }
                  }
                  
                  // Validate field is 'workflowExecutionId' or 'workflow_execution_id'
                  if (columnName && columnName !== 'workflowExecutionId' && columnName !== 'workflow_execution_id' && filterExecId) {
                    console.log('[FAKE DB] Warning: workflow_steps filter not on workflowExecutionId column:', columnName, '- but using filterExecId anyway');
                  }
                }
                // Handle plain object with operator (fallback)
                else if (cond && typeof cond === 'object' && 'operator' in cond && (cond as Record<string, unknown>).operator === '=') {
                  const c = cond as Record<string, unknown>;
                  if (c.right && typeof c.right === 'string') {
                    filterExecId = c.right;
                    if (c.left && typeof c.left === 'object' && 'name' in c.left) {
                      const leftName = String((c.left as Record<string, unknown>).name);
                      if (leftName !== 'workflowExecutionId' && leftName !== 'workflow_execution_id') {
                        console.log('[FAKE DB] Warning: workflow_steps filter not on workflowExecutionId column:', leftName);
                      }
                    }
                  }
                }
                
                // DEBUG - log all steps in store
                console.log('[FAKE DB] workflow_steps store keys:', Array.from(steps.keys()));
                console.log('[FAKE DB] workflow_steps store size:', steps.size);
                for (const [key, arr] of steps.entries()) {
                  console.log('[FAKE DB] workflow_steps for execId', key, ':', arr.length, 'steps');
                }
                
                // DEBUG
                console.log('[FAKE DB] workflow_steps where:', { filterExecId });
                
                const allSteps: Record<string, unknown>[] = [];
                for (const arr of steps.values()) allSteps.push(...(arr as unknown as Record<string, unknown>[]));
                console.log('[FAKE DB] workflow_steps all steps before filter:', allSteps.length);
                const rows = allSteps.filter(
                  (v) => !filterExecId || String((v as Record<string, unknown>)['workflowExecutionId']) === filterExecId
                );
                console.log('[FAKE DB] workflow_steps rows after filter:', rows.length);
                const promise = Promise.resolve(rows);
                return Object.assign(promise, builder);
              }
              if (tableName === 'approvals') {
                // Try to filter by workflowExecutionId from condition (eq(approvals.workflowExecutionId, '...'))
                // Or by id (eq(approvals.id, '...'))
                let filterExecId: string | null = null;
                let filterId: string | null = null;
                let filterField: 'id' | 'workflowExecutionId' | null = null;
                
                // Handle Drizzle SQL object (has queryChunks array)
                if (cond && typeof cond === 'object' && 'queryChunks' in cond) {
                  const sql = cond as { queryChunks: unknown[] };
                  console.log('[FAKE DB] SQL queryChunks for approvals:', sql.queryChunks.map(c => c?.constructor?.name));
                  
                  // Find the column chunk
                  let columnName: string | null = null;
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'name' in chunk && typeof (chunk as Record<string, unknown>).name === 'string') {
                      columnName = (chunk as Record<string, unknown>).name as string;
                      console.log('[FAKE DB] Found column chunk for approvals:', columnName);
                      break;
                    }
                  }
                  
                  // Find the Param chunk which contains the value
                  for (const chunk of sql.queryChunks) {
                    if (chunk && typeof chunk === 'object' && 'constructor' in chunk && chunk.constructor?.name === 'Param') {
                      const param = chunk as { value: unknown };
                      console.log('[FAKE DB] Found Param chunk for approvals:', param.value);
                      if (typeof param.value === 'string') {
                        if (columnName === 'id') {
                          filterId = param.value;
                          filterField = 'id';
                        } else if (columnName === 'workflowExecutionId' || columnName === 'workflow_execution_id') {
                          filterExecId = param.value;
                          filterField = 'workflowExecutionId';
                        }
                        break;
                      }
                    }
                  }
                  
                  // Validate field
                  if (columnName !== 'id' && columnName !== 'workflowExecutionId' && columnName !== 'workflow_execution_id') {
                    console.log('[FAKE DB] Warning: approvals filter on unknown column:', columnName);
                  }
                }
                // Handle plain object with operator (fallback)
                else if (cond && typeof cond === 'object' && 'operator' in cond && (cond as Record<string, unknown>).operator === '=') {
                  const c = cond as Record<string, unknown>;
                  if (c.right && typeof c.right === 'string') {
                    if (c.left && typeof c.left === 'object' && 'name' in c.left) {
                      const leftName = String((c.left as Record<string, unknown>).name);
                      if (leftName === 'id') {
                        filterId = c.right;
                        filterField = 'id';
                      } else if (leftName === 'workflowExecutionId' || leftName === 'workflow_execution_id') {
                        filterExecId = c.right;
                        filterField = 'workflowExecutionId';
                      }
                    }
                  }
                }
                
                // DEBUG
                console.log('[FAKE DB] approvals where:', { filterField, filterId, filterExecId });
                
                const rows = Array.from(approvalStore.values()).filter(
                  (a) => {
                    const rec = a as Record<string, unknown>;
                    if (filterId) return String(rec['id']) === filterId;
                    if (filterExecId) return String(rec['workflowExecutionId']) === filterExecId;
                    return true;
                  },
                );
                const promise = Promise.resolve(rows);
                return Object.assign(promise, builder);
              }
              if (tableName === 'agent_runs') {
                // Try to extract filter from condition for correlationId
                let filterCorrelationId: string | null = null;
                
                // Helper to recursively find Param chunks in SQL queryChunks
                function findParamChunks(chunks: unknown[]): Array<{ value: unknown }> {
                  const params: Array<{ value: unknown }> = [];
                  for (const chunk of chunks) {
                    if (chunk && typeof chunk === 'object') {
                      if ('constructor' in chunk && chunk.constructor?.name === 'Param') {
                        params.push(chunk as { value: unknown });
                      } else if ('queryChunks' in chunk) {
                        // Nested SQL object - recurse
                        params.push(...findParamChunks((chunk as { queryChunks: unknown[] }).queryChunks));
                      }
                    }
                  }
                  return params;
                }
                
                // Handle Drizzle SQL object (has queryChunks array)
                if (cond && typeof cond === 'object' && 'queryChunks' in cond) {
                  const sql = cond as { queryChunks: unknown[] };
                  console.log('[FAKE DB] SQL queryChunks for agent_runs:', sql.queryChunks.map(c => c?.constructor?.name));
                  
                  // Find all Param chunks (including nested)
                  const params = findParamChunks(sql.queryChunks);
                  for (const param of params) {
                    console.log('[FAKE DB] Found Param chunk for agent_runs:', param.value);
                    if (typeof param.value === 'string') {
                      filterCorrelationId = param.value;
                      break;
                    }
                  }
                }
                // Handle plain object with operator (fallback)
                else if (cond && typeof cond === 'object' && 'operator' in cond && (cond as Record<string, unknown>).operator === '=') {
                  const c = cond as Record<string, unknown>;
                  if (c.right && typeof c.right === 'string') {
                    filterCorrelationId = c.right;
                  }
                }
                
                console.log('[FAKE DB] agent_runs where:', { filterCorrelationId });
                
                const rows = runStore.filter(
                  (v) => !filterCorrelationId || String((v as Record<string, unknown>)['correlationId']) === filterCorrelationId
                );
                console.log('[FAKE DB] agent_runs rows after filter:', rows.length);
                const promise = Promise.resolve(rows);
                return Object.assign(promise, builder);
              }
              // Default
              const promise = Promise.resolve([]);
              return Object.assign(promise, builder);
            },
          };
        },
      };
    },

    update(table: unknown) {
      const tableName = getTableName(table);
      return {
        set(patch: Record<string, unknown>) {
          return {
            where(_cond: unknown) {
              if (tableName === 'workflow_executions') {
                // Apply to all execs for simplicity (only one test exec matters)
                for (const row of execs.values()) {
                  Object.assign(row as Record<string, unknown>, patch as Record<string, unknown>);
                }
              } else if (tableName === 'workflow_steps') {
                for (const arr of steps.values()) {
                  for (const r of arr as unknown as Record<string, unknown>[]) {
                    Object.assign(r as Record<string, unknown>, patch as Record<string, unknown>);
                  }
                }
              } else if (tableName === 'approvals') {
                for (const r of approvalStore.values()) {
                  Object.assign(r as Record<string, unknown>, patch as Record<string, unknown>);
                }
              }
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  };

  return { fakeDb: fakeDb as { _defs: typeof defs; _execs: typeof execs; _steps: typeof steps; _approvalStore: typeof approvalStore; _runStore: typeof runStore }, defs, execs, steps, approvalStore, runStore, nextId };
}

function getTableName(table: unknown): string {
  // Drizzle tables are objects with Symbol keys; identity check via tableKey map is more reliable
  // We maintain a weak map populated after imports are available
  const hasKey = tableKeyMap.has(table as object);
  console.log('[FAKE DB] getTableName tableKeyMap.has:', hasKey);
  if (hasKey) return tableKeyMap.get(table as object) as string;
  // Fallback: string coercion for cases where a new table instance is passed
  try {
    const str = String(table);
    console.log('[FAKE DB] getTableName fallback str:', str);
    if (str.includes('agent_runs') || str.includes('agentRuns')) return 'agent_runs';
    if (str.includes('workflow_definitions') || str.includes('workflowDefinitions')) return 'workflow_definitions';
    if (str.includes('workflow_executions') || str.includes('workflowExecutions')) return 'workflow_executions';
    if (str.includes('workflow_steps') || str.includes('workflowSteps')) return 'workflow_steps';
    if (str.includes('approvals')) return 'approvals';
    if (str.includes('tool_runs') || str.includes('toolRuns')) return 'tool_runs';
    if (str.includes('agent_events') || str.includes('agentEvents')) return 'agent_events';
  } catch (e) {
    console.log('[FAKE DB] getTableName fallback error:', e);
  }
  
  // Try to extract table name from PgTable columns (Drizzle table objects)
  if (table && typeof table === 'object') {
    const tbl = table as Record<string, unknown>;
    // Check columns for uniqueName pattern like 'workflow_definitions_id_unique'
    for (const key of Object.keys(tbl)) {
      const col = tbl[key] as Record<string, unknown> | undefined;
      if (col && typeof col === 'object' && 'uniqueName' in col && typeof col.uniqueName === 'string') {
        const uniqueName = col.uniqueName;
        // Extract table name from 'workflow_definitions_id_unique' -> 'workflow_definitions'
        const match = uniqueName.match(/^(.+)_\w+_unique$/);
        if (match) {
          console.log('[FAKE DB] getTableName extracted from uniqueName:', match[1]);
          return match[1];
        }
      }
    }
  }
  
  return 'unknown';
}

// Map from table object identity to name string — populated lazily after schema import
const tableKeyMap = new WeakMap<object, string>();

export async function populateTableMap(): Promise<void> {
  if (tableKeyMap.has({} as object)) return; // already attempted? use size check instead
  try {
    const schema = await import('../../db/schema.js');
    tableKeyMap.set(schema.agentRuns as unknown as object, 'agent_runs');
    tableKeyMap.set(schema.workflowDefinitions as unknown as object, 'workflow_definitions');
    tableKeyMap.set(schema.workflowExecutions as unknown as object, 'workflow_executions');
    tableKeyMap.set(schema.workflowSteps as unknown as object, 'workflow_steps');
    tableKeyMap.set(schema.approvals as unknown as object, 'approvals');
    tableKeyMap.set(schema.toolRuns as unknown as object, 'tool_runs');
    tableKeyMap.set(schema.agentEvents as unknown as object, 'agent_events');
    // Also users/audit if needed
    tableKeyMap.set(schema.users as unknown as object, 'users');
    tableKeyMap.set(schema.auditEvents as unknown as object, 'audit_events');
  } catch {
    // ignore — fallback to string detection
  }
}