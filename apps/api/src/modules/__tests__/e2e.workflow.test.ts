import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { NineRouterGateway } from '../gateway/nineRouter.gateway.js';
import type { Logger } from '../../logger.js';
import { createFakeDb, populateTableMap } from './test-helpers.js';
import type { AgentDefinition } from '../agents/types.js';
import { AgentRegistry } from '../agents/registry.js';
import { AgentService } from '../agents/agent.service.js';
import { ToolRegistry } from '../tools/registry.js';
import { webSearchTool } from '../tools/tools/webSearch.tool.js';
import { fetchUrlTool } from '../tools/tools/fetchUrl.tool.js';
import { RunLogger } from '../runs/runLogger.js';
import { ExecutionStore } from '../orchestration/executionStore.js';
import { WorkflowEngine } from '../orchestration/workflowEngine.js';
import { WorkflowService } from '../orchestration/workflow.service.js';
import { z } from 'zod';
import { AppError } from '@kantorku/shared';

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

async function waitForCompletion(
  app: FastifyInstance,
  executionId: string,
  token: string,
  maxAttempts = 50,
  intervalMs = 100,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workflows/executions/${executionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json() as { success: boolean; data: { status: string } };
    if (body.success && (body.data.status === 'completed' || body.data.status === 'failed')) {
      return body.data;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Execution ${executionId} did not complete in time`);
}

describe('Task 9 e2e workflow (mocked gateway)', { timeout: 30000 }, () => {
  let app: FastifyInstance;
  let validToken: string;
  let gatewayMock: NineRouterGateway;

  beforeAll(async () => {
    const logger = mockLogger();

    // Build app with mocked gateway that we can control per test
    gatewayMock = {
      chat: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
    } as unknown as NineRouterGateway;

    // Ensure table map is populated for fakeDb
    await populateTableMap();

    // Create a fake Drizzle instance for testing (no real DB needed)
    const { fakeDb } = createFakeDb();

    // Build service graph with fake DB
    const registry = new AgentRegistry();
    
    // Register the 3 agents needed for content-production-v1 workflow
    const researchDef: AgentDefinition = {
      id: 'research-agent',
      name: 'Research Agent',
      version: '1.0.0',
      role: 'researcher',
      purpose: 'research',
      inputSchema: z.object({
        query: z.string().min(1),
        contentCategory: z.string().optional(),
        brandVoice: z.string().optional(),
        template: z.string().optional(),
        tradingDna: z.string().optional(),
      }),
      outputSchema: z.object({ summary: z.string(), sources: z.array(z.object({ url: z.string().url() })) }),
      allowedTools: ['web_search'],
      systemPrompt: 'You are a Research Agent',
      promptVersion: 'research-agent@1.0.0',
      modelPolicy: 'research',
      config: {},
    };
    const strategistDef: AgentDefinition = {
      id: 'content-strategist-agent',
      name: 'Content Strategist Agent',
      version: '1.0.0',
      role: 'strategist',
      purpose: 'strategy',
      inputSchema: z.object({
        research: z.object({ summary: z.string(), sources: z.array(z.object({ url: z.string().url() })) }),
        contentCategory: z.string().optional(),
        brandVoice: z.string().optional(),
      }),
      outputSchema: z.object({ angle: z.string() }),
      allowedTools: [],
      systemPrompt: 'You are a Strategist',
      promptVersion: 'content-strategist-agent@1.0.0',
      modelPolicy: 'strategy',
      config: {},
    };
    const copywriterDef: AgentDefinition = {
      id: 'copywriter-agent',
      name: 'Copywriter Agent',
      version: '1.0.0',
      role: 'copywriter',
      purpose: 'copywriting',
      inputSchema: z.object({
        strategy: z.object({ angle: z.string() }),
        template: z.string().optional(),
        tradingDna: z.string().optional(),
      }),
      outputSchema: z.object({ headline: z.string(), body: z.string() }),
      allowedTools: [],
      systemPrompt: 'You are a Copywriter',
      promptVersion: 'copywriter-agent@1.0.0',
      modelPolicy: 'copywriting',
      config: {},
    };
    registry.register(researchDef);
    registry.register(strategistDef);
    registry.register(copywriterDef);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(webSearchTool);
    toolRegistry.register(fetchUrlTool);

    const runLogger = new RunLogger(fakeDb, logger);
    const agentService = new AgentService(registry, gatewayMock, toolRegistry, logger, runLogger);
    const executionStore = new ExecutionStore(fakeDb, logger);
    const workflowService = new WorkflowService(executionStore, logger);
    const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    const workflowEngine = new WorkflowEngine(
      executionStore,
      agentService,
      runLogger,
      null, // Use null queue to force in-process execution for testing
      logger,
    );

    // Build app with our fake DB and services
    app = await buildApp({ logger: false as unknown as never, db: fakeDb as any });

    // Override app's service instances with our test instances
    (app as unknown as Record<string, unknown>)['agentRegistry'] = registry;
    (app as unknown as Record<string, unknown>)['agentService'] = agentService;
    (app as unknown as Record<string, unknown>)['toolRegistry'] = toolRegistry;
    (app as unknown as Record<string, unknown>)['runLogger'] = runLogger;
    (app as unknown as Record<string, unknown>)['executionStore'] = executionStore;
    (app as unknown as Record<string, unknown>)['workflowService'] = workflowService;
    (app as unknown as Record<string, unknown>)['workflowEngine'] = workflowEngine;

    await app.ready();

    // Mint a valid JWT
    validToken = app.jwt.sign({ sub: 'test-user-e2e', email: 'e2e@example.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('linear workflow research→strategist→copywriter completes and populates agent_runs', async () => {
    // Setup mock responses for each agent in order - must match output schemas
    // 1. Research agent output - matches outputSchema: { summary: string, sources: Array<{ url: string }> }
    const researchOutput = {
      summary: 'BTC outlook is bullish based on macro factors',
      sources: [{ url: 'https://example.com/1' }],
    };

    // 2. Strategist agent output - matches outputSchema: { angle: string }
    const strategistOutput = {
      angle: 'BTC as macro hedge for institutional portfolios',
    };

    // 3. Copywriter agent output - matches outputSchema: { headline: string, body: string }
    const copywriterOutput = {
      headline: 'BTC: The Institutional Inflation Hedge',
      body: 'Macro data shows BTC outperforming during high inflation periods with growing institutional adoption.',
    };

    const chatMock = gatewayMock.chat as ReturnType<typeof vi.fn>;
    chatMock
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify(researchOutput),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latencyMs: 200,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-strategy-v1',
        provider: '9router',
        content: JSON.stringify(strategistOutput),
        usage: { promptTokens: 80, completionTokens: 60, totalTokens: 140 },
        latencyMs: 180,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-copywriting-v1',
        provider: '9router',
        content: JSON.stringify(copywriterOutput),
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
        latencyMs: 220,
        fallbackUsed: false,
      });

    // Execute workflow
    console.log('[E2E TEST] About to call execute workflow');
    const execRes = await app.inject({
      method: 'POST',
      url: '/api/workflows/content-production-v1/execute',
      headers: { authorization: `Bearer ${validToken}` },
      payload: { input: { query: 'BTC outlook', contentCategory: 'trading', brandVoice: 'professional', template: 'thread', tradingDna: 'macro' } },
    });

    expect(execRes.statusCode).toBe(202);
    const execBody = execRes.json() as { success: boolean; data: { executionId: string; correlationId: string } };
    expect(execBody.success).toBe(true);
    const executionId = execBody.data.executionId;
    const correlationId = execBody.data.correlationId;

    // Poll for completion
    const finalExec = await waitForCompletion(app, executionId, validToken);
    console.log('[E2E TEST] Final execution:', JSON.stringify(finalExec, null, 2));
    
    // Debug: check if there's an error
    if (finalExec.status === 'failed') {
      console.log('[E2E TEST] Execution failed with error:', finalExec.error);
    }

    expect(finalExec.status).toBe('completed');
    expect(finalExec.steps).toHaveLength(3);

    // Verify agent_runs were created (3 runs for 3 agents)
    const runsRes = await app.inject({
      method: 'GET',
      url: `/api/runs?correlationId=${correlationId}`,
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(runsRes.statusCode).toBe(200);
    const runsBody = runsRes.json() as { success: boolean; data: { rows: Array<Record<string, unknown>>; total: number } };
    expect(runsBody.success).toBe(true);
    expect(runsBody.data.rows.length).toBe(3);
    expect(runsBody.data.total).toBe(3);
  });

  it('Review Focus #1: invalid JSON triggers repair retry then VALIDATION_ERROR', async () => {
    const chatMock = gatewayMock.chat as ReturnType<typeof vi.fn>;
    // First call returns invalid JSON, second call (repair) also returns invalid JSON
    chatMock
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: 'not valid json {{{',
        usage: undefined,
        latencyMs: 100,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: 'still not valid {{{',
        usage: undefined,
        latencyMs: 100,
        fallbackUsed: false,
      });

    // Use sync agent run endpoint to test the repair logic directly
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/research-agent/run',
      headers: { authorization: `Bearer ${validToken}` },
      payload: { input: { query: 'test' } },
    });

    // Should fail with VALIDATION_ERROR after one repair retry
    expect(res.statusCode).toBe(400);
    const body = res.json() as { success: boolean; error: { code: string; details: unknown } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // Gateway chat should have been called twice (original + 1 repair)
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('Review Focus #2: 429 on primary falls back, double-failure is PROVIDER_ERROR', async () => {
    const chatMock = gatewayMock.chat as ReturnType<typeof vi.fn>;
    // Simulate gateway's fallback behavior: both primary and fallback fail -> PROVIDER_ERROR with combined details
    const combinedError = new AppError('PROVIDER_ERROR', 'Both primary and fallback failed', 502, {
      primary: { code: 'PROVIDER_ERROR', message: '429 Too Many Requests', details: { status: 429 }, statusCode: 502 },
      fallback: { code: 'PROVIDER_ERROR', message: '500 Internal Server Error', details: { status: 500 }, statusCode: 502 },
    });
    chatMock.mockRejectedValueOnce(combinedError);

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/research-agent/run',
      headers: { authorization: `Bearer ${validToken}` },
      payload: { input: { query: 'test' } },
    });

    expect(res.statusCode).toBe(502); // PROVIDER_ERROR maps to 502
    const body = res.json() as { success: boolean; error: { code: string; details: unknown } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PROVIDER_ERROR');
    // Should have both primary and fallback errors in details
    expect(body.error.details).toBeDefined();
    const details = body.error.details as { primary: unknown; fallback: unknown };
    expect(details.primary).toBeDefined();
    expect(details.fallback).toBeDefined();
    // Gateway chat should have been called once (the mock simulates the final result after fallback)
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
});