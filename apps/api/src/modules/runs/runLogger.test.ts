import { describe, it, expect, vi } from 'vitest';
import { RunLogger, type AgentRunRecord } from './runLogger.js';
import { agentRuns, toolRuns, agentEvents } from '../../db/schema.js';
import type { Logger } from '../../logger.js';

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

class FakeDb {
  agentRunsStore: Array<Record<string, unknown>> = [];
  toolRunsStore: Array<Record<string, unknown>> = [];
  eventsStore: Array<Record<string, unknown>> = [];

  insert(table: unknown) {
    const self = this;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values(vals: any) {
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          returning(_proj: any) {
            let store: Array<Record<string, unknown>>;
            if (table === agentRuns) store = self.agentRunsStore;
            else if (table === toolRuns) store = self.toolRunsStore;
            else if (table === agentEvents) store = self.eventsStore;
            else store = self.agentRunsStore;

            const idx = store.length + 1;
            const id = `00000000-0000-4000-a000-${String(idx).padStart(12, '0')}`;
            const row: Record<string, unknown> = {
              id,
              ...vals,
              createdAt: new Date(),
            };
            // For agentRuns, ensure the row is queryable via select().from(agentRuns)
            // Drizzle maps camelCase JS keys to snake_case columns but JS access is camelCase.
            // So we keep camelCase as stored.
            store.push(row);
            return Promise.resolve([{ id }]);
          },
        };
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select(projection?: any) {
    const self = this;
    const isCount = projection !== undefined && projection !== null && typeof projection === 'object' && 'count' in projection;

    return {
      from(_table: unknown) {
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where(_cond: any) {
            if (isCount) {
              return Promise.resolve([{ count: self.agentRunsStore.length }]);
            }
            return {
              limit(n: number) {
                return {
                  offset(o: number) {
                    const slice = self.agentRunsStore.slice(o, o + n);
                    return Promise.resolve(slice);
                  },
                };
              },
            };
          },
        };
      },
    };
  }
}

function makeAgentRunRecord(overrides?: Partial<Omit<AgentRunRecord, 'id'>>): Omit<AgentRunRecord, 'id'> {
  return {
    agentDefinitionId: '00000000-0000-4000-a000-000000000010',
    modelProvider: '9router',
    modelName: 'mid-research-v1',
    promptVersion: 'research-agent@1.0.0',
    status: 'completed',
    input: { query: 'BTC outlook' },
    output: { summary: 'ok', confidence: 'high' as const },
    usageMetadata: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs: 123,
    correlationId: 'corr-1',
    startedAt: new Date('2026-10-06T10:00:00Z'),
    completedAt: new Date('2026-10-06T10:00:01Z'),
    ...overrides,
  };
}

describe('RunLogger', () => {
  it('logAgentRun inserts and returns id', async () => {
    const db = new FakeDb();
    const logger = mockLogger();
    const runLogger = new RunLogger(db as unknown as never, logger);

    const rec = makeAgentRunRecord();
    const id = await runLogger.logAgentRun(rec);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(db.agentRunsStore).toHaveLength(1);
    const stored = db.agentRunsStore[0] as Record<string, unknown>;
    expect(stored['agentDefinitionId']).toBe(rec.agentDefinitionId);
    expect(stored['modelName']).toBe('mid-research-v1');
    expect(stored['correlationId']).toBe('corr-1');
    expect(stored['status']).toBe('completed');
    // logger.debug called with correlationId but not with input/output
    const debugCalls = (logger.debug as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(debugCalls.length).toBeGreaterThan(0);
    const firstDebugArg = debugCalls[0]?.[0] as Record<string, unknown> | undefined;
    expect(firstDebugArg).toHaveProperty('correlationId', 'corr-1');
    const debugStr = JSON.stringify(debugCalls);
    expect(debugStr).not.toContain('BTC outlook');
  });

  it('logAgentRun persists large payload as full jsonb and never logs secrets', async () => {
    const db = new FakeDb();
    const logger = mockLogger();
    const runLogger = new RunLogger(db as unknown as never, logger);

    const large = 'x'.repeat(100_000);
    const rec = makeAgentRunRecord({
      input: { query: large },
      output: { summary: large, confidence: 'high' as const },
    });

    const id = await runLogger.logAgentRun(rec);
    expect(id).toBeDefined();
    expect(db.agentRunsStore).toHaveLength(1);
    const stored = db.agentRunsStore[0] as Record<string, unknown>;
    const storedInput = stored['input'] as { query: string };
    const storedOutput = stored['output'] as { summary: string };
    expect(storedInput.query).toHaveLength(100_000);
    expect(storedOutput.summary).toHaveLength(100_000);

    // Ensure logger never received the large payload
    const debugCalls = (logger.debug as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const debugPayload = JSON.stringify(debugCalls);
    expect(debugPayload).not.toContain(large.slice(0, 20));
    // Also ensure raw input/output not in log args
    for (const call of debugCalls) {
      const argStr = JSON.stringify(call);
      expect(argStr).not.toContain('x'.repeat(50));
    }
  });

  it('logToolRun inserts and returns id', async () => {
    const db = new FakeDb();
    const logger = mockLogger();
    const runLogger = new RunLogger(db as unknown as never, logger);

    const agentRunId = '00000000-0000-4000-a000-000000000099';
    const id = await runLogger.logToolRun(agentRunId, 'web_search', { query: 'test' }, { results: [] }, 42, 'completed');
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(db.toolRunsStore).toHaveLength(1);
    expect(db.toolRunsStore[0]?.['toolName']).toBe('web_search');
    expect(db.toolRunsStore[0]?.['agentRunId']).toBe(agentRunId);
  });

  it('logAgentEvent inserts and returns id', async () => {
    const db = new FakeDb();
    const logger = mockLogger();
    const runLogger = new RunLogger(db as unknown as never, logger);

    const id = await runLogger.logAgentEvent({
      agentRunId: '00000000-0000-4000-a000-000000000099',
      eventType: 'step_started',
      payload: { step: 'research' },
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(db.eventsStore).toHaveLength(1);
    expect(db.eventsStore[0]?.['eventType']).toBe('step_started');
    // logger should not contain payload secrets
    const debugCalls = (logger.debug as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const argStr = JSON.stringify(debugCalls[0]);
    expect(argStr).not.toContain('research');
  });

  it('queryAgentRuns paginates with limit/offset and returns total', async () => {
    const db = new FakeDb();
    const logger = mockLogger();
    const runLogger = new RunLogger(db as unknown as never, logger);

    // Seed 5 rows
    for (let i = 0; i < 5; i++) {
      await runLogger.logAgentRun(
        makeAgentRunRecord({
          correlationId: `corr-${i}`,
          input: { query: `q${i}` },
        }),
      );
    }
    expect(db.agentRunsStore).toHaveLength(5);

    const page1 = await runLogger.queryAgentRuns({ page: 1, pageSize: 2 });
    expect(page1.rows.length).toBeLessThanOrEqual(2);
    expect(page1.rows.length).toBe(2);
    expect(page1.total).toBe(5);

    const page2 = await runLogger.queryAgentRuns({ page: 2, pageSize: 2 });
    expect(page2.rows.length).toBe(2);
    expect(page2.total).toBe(5);

    const page3 = await runLogger.queryAgentRuns({ page: 3, pageSize: 2 });
    expect(page3.rows.length).toBe(1);
    expect(page3.total).toBe(5);

    // Ensure pagination respects pageSize clamping and defaults
    const defaultPage = await runLogger.queryAgentRuns({});
    expect(defaultPage.rows.length).toBe(5);
    expect(defaultPage.total).toBe(5);

    // Never log secrets in query either
    const debugCalls = (logger.debug as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastCall = debugCalls[debugCalls.length - 1]?.[0] as Record<string, unknown> | undefined;
    expect(lastCall).toHaveProperty('page');
    expect(JSON.stringify(debugCalls)).not.toContain('q0');
  });
});
