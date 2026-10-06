import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { BaseAgent } from './baseAgent.js';
import type { AgentDefinition, AgentContext } from './types.js';
import type { NineRouterGateway } from '../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Logger } from '../../logger.js';
import { webSearchTool } from '../tools/tools/webSearch.tool.js';

// Define test schemas
const testInputSchema = z.object({
  query: z.string().min(1),
  maxSources: z.number().int().min(1).max(10).default(5),
});

const testOutputSchema = z.object({
  result: z.string(),
  count: z.number().int(),
});

type TestInput = z.infer<typeof testInputSchema>;
type TestOutput = z.infer<typeof testOutputSchema>;

function makeTestDefinition(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    version: '1.0.0',
    role: 'tester',
    purpose: 'testing',
    inputSchema: testInputSchema,
    outputSchema: testOutputSchema,
    allowedTools: ['web_search'],
    systemPrompt: 'You are a test agent',
    promptVersion: 'test-agent@1.0.0',
    modelPolicy: 'research',
    config: {},
    ...overrides,
  };
}

// Concrete test agent
class TestAgent extends BaseAgent<TestInput, TestOutput> {
  readonly definition: AgentDefinition;
  constructor(
    definition: AgentDefinition,
    gateway: NineRouterGateway,
    toolRegistry: ToolRegistry,
    logger: Logger,
  ) {
    super(gateway, toolRegistry, logger);
    this.definition = definition;
  }

  protected buildMessages(
    input: TestInput,
    _ctx: AgentContext,
  ): { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] {
    return [
      { role: 'system', content: this.definition.systemPrompt },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  // Expose protected getTools for testing
  public getToolsPublic() {
    return this.getTools();
  }

  public buildMessagesPublic(input: TestInput, ctx: AgentContext) {
    return this.buildMessages(input, ctx);
  }
}

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

function mockToolRegistry(allowedTools: string[] = ['web_search']): ToolRegistry {
  const registry = {
    getMany: vi.fn((names: string[]) => {
      // Simulate real filtering: only return tools that match allowed
      if (names.includes('web_search')) return [webSearchTool.definition];
      return [];
    }),
    get: vi.fn(),
    register: vi.fn(),
    execute: vi.fn(),
  } as unknown as ToolRegistry;
  // Make getMany filter by the agent's allowedTools — but our test agent has allowedTools,
  // and the mock should respect requested names. So keep as above.
  void allowedTools;
  return registry;
}

function mockGateway(): NineRouterGateway & { chat: ReturnType<typeof vi.fn> } {
  return {
    chat: vi.fn(),
    listModels: vi.fn(),
  } as unknown as NineRouterGateway & { chat: ReturnType<typeof vi.fn> };
}

const ctx: AgentContext = { correlationId: 'test-corr-1' };

describe('BaseAgent', () => {
  let gateway: ReturnType<typeof mockGateway>;
  let toolRegistry: ToolRegistry;
  let logger: Logger;
  let definition: AgentDefinition;

  beforeEach(() => {
    gateway = mockGateway();
    toolRegistry = mockToolRegistry();
    logger = mockLogger();
    definition = makeTestDefinition();
  });

  it('validates input and throws VALIDATION_ERROR on bad input', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);

    await expect(agent.run({ query: '', maxSources: 5 } as unknown as TestInput, ctx)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    // Gateway must not have been called at all
    expect(gateway.chat).not.toHaveBeenCalled();
  });

  it('validates output schema and does one repair retry on mismatch', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);

    // First call returns JSON missing required field `count` (validation failure)
    gateway.chat
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'hello' }), // missing count
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 100,
        fallbackUsed: false,
      })
      // Second call (repair retry) returns valid JSON
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'hello', count: 42 }),
        usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
        latencyMs: 80,
        fallbackUsed: false,
      });

    const result = await agent.run({ query: 'test query', maxSources: 5 }, ctx);

    expect(result.output).toEqual({ result: 'hello', count: 42 });
    expect(gateway.chat).toHaveBeenCalledTimes(2);

    // Second call should contain a repair system message
    const secondCallArgs = gateway.chat.mock.calls[1] as unknown[];
    const secondReq = secondCallArgs[0] as { messages: { role: string; content: string }[] };
    const repairMsg = secondReq.messages.find((m) => m.content.includes('failed schema validation'));
    expect(repairMsg).toBeDefined();
    expect(repairMsg?.content).toContain('Return ONLY valid JSON');
  });

  it('throws VALIDATION_ERROR after repair retry fails', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);

    // Both calls return invalid JSON (missing count)
    gateway.chat
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'bad' }),
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'still bad' }),
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      });

    await expect(agent.run({ query: 'valid query', maxSources: 5 }, ctx)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(gateway.chat).toHaveBeenCalledTimes(2);
  });

  it('does one repair retry on malformed JSON (not just schema mismatch) then succeeds', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);

    gateway.chat
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: 'THIS IS NOT JSON {{{',
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'recovered', count: 1 }),
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      });

    const result = await agent.run({ query: 'valid query', maxSources: 5 }, ctx);
    expect(result.output).toEqual({ result: 'recovered', count: 1 });
    expect(gateway.chat).toHaveBeenCalledTimes(2);
  });

  it('throws VALIDATION_ERROR when both JSON parses are malformed', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);

    gateway.chat
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: 'not json',
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: 'still not json',
        usage: undefined,
        latencyMs: 50,
        fallbackUsed: false,
      });

    await expect(agent.run({ query: 'valid query', maxSources: 5 }, ctx)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(gateway.chat).toHaveBeenCalledTimes(2);
  });

  it('enforces allowedTools subset', () => {
    const defWithWebSearch = makeTestDefinition({ allowedTools: ['web_search'] });
    const agent = new TestAgent(defWithWebSearch, gateway, toolRegistry, logger);
    const tools = agent.getToolsPublic();
    expect(tools.map((t) => t.name)).toEqual(['web_search']);
  });

  it('does not call repair retry on non-validation errors from gateway', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);
    const providerError = new (await import('@kantorku/shared')).AppError(
      'PROVIDER_ERROR',
      'provider down',
      502,
    );
    gateway.chat.mockRejectedValueOnce(providerError);

    await expect(agent.run({ query: 'valid', maxSources: 5 }, ctx)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    // Should NOT retry
    expect(gateway.chat).toHaveBeenCalledTimes(1);
  });

  it('buildMessages includes system prompt and input JSON', () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);
    const msgs = agent.buildMessagesPublic({ query: 'BTC outlook', maxSources: 5 }, ctx);
    expect(msgs[0]?.content).toContain('You are a test agent');
    expect(msgs[1]?.content).toContain('BTC outlook');
  });

  it('request includes json_schema responseFormat and allowed tools', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);
    gateway.chat.mockResolvedValueOnce({
      model: 'mid-research-v1',
      provider: '9router',
      content: JSON.stringify({ result: 'ok', count: 1 }),
      usage: undefined,
      latencyMs: 10,
      fallbackUsed: false,
    });

    await agent.run({ query: 'hello', maxSources: 5 }, ctx);

    const req = gateway.chat.mock.calls[0]?.[0] as {
      model: string;
      responseFormat?: { type: string; schema?: unknown };
      tools?: unknown[];
    };
    expect(req.responseFormat?.type).toBe('json_schema');
    expect(req.responseFormat?.schema).toBeDefined();
    expect(req.tools).toBeDefined();
  });

  it('exactly one repair retry — does not loop forever', async () => {
    const agent = new TestAgent(definition, gateway, toolRegistry, logger);
    // Return invalid JSON 3 times — third must not be called
    gateway.chat
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'bad' }),
        usage: undefined,
        latencyMs: 10,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'bad again' }),
        usage: undefined,
        latencyMs: 10,
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        model: 'mid-research-v1',
        provider: '9router',
        content: JSON.stringify({ result: 'third', count: 99 }),
        usage: undefined,
        latencyMs: 10,
        fallbackUsed: false,
      });

    await expect(agent.run({ query: 'valid', maxSources: 5 }, ctx)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    // Only 2 calls — not 3
    expect(gateway.chat).toHaveBeenCalledTimes(2);
  });
});
