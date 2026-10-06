import { describe, it, expect, vi } from 'vitest';
import { researchAgentDefinition, ResearchAgent } from './research.agent.js';
import { strategistAgentDefinition } from './contentStrategist.agent.js';
import { copywriterAgentDefinition } from './copywriter.agent.js';
import type { AgentContext } from '../types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';

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

function mockToolRegistry(): ToolRegistry {
  return {
    getMany: vi.fn(() => []),
    get: vi.fn(),
    register: vi.fn(),
    execute: vi.fn(),
  } as unknown as ToolRegistry;
}

function mockGateway(): NineRouterGateway & { chat: ReturnType<typeof vi.fn> } {
  return {
    chat: vi.fn(),
    listModels: vi.fn(),
  } as unknown as NineRouterGateway & { chat: ReturnType<typeof vi.fn> };
}

const ctx: AgentContext = { correlationId: 'test-corr-agents-1' };

describe('Concrete Agents — Task 5 schemas and buildMessages', () => {
  it('ResearchAgent input schema rejects empty query', () => {
    expect(() => researchAgentDefinition.inputSchema.parse({ query: '' })).toThrow();
  });

  it('ResearchAgent output schema requires sources with url', () => {
    expect(() =>
      researchAgentDefinition.outputSchema.parse({
        sources: [{ title: 'x', excerpt: 'y' } as unknown as Record<string, unknown>],
        summary: 's',
        confidence: 'high',
        provenance: [],
      }),
    ).toThrow();
  });

  it('Strategist output requires angle + slideStructure', () => {
    // Missing angle
    expect(() =>
      strategistAgentDefinition.outputSchema.parse({
        goal: 'g',
        audience: 'a',
        hookDirections: ['h1'],
        slideStructure: [{ index: 1, purpose: 'intro' }],
        ctaStrategy: 'cta',
      }),
    ).toThrow();

    // Missing slideStructure
    expect(() =>
      strategistAgentDefinition.outputSchema.parse({
        goal: 'g',
        audience: 'a',
        angle: 'angle-1',
        hookDirections: ['h1'],
        ctaStrategy: 'cta',
      }),
    ).toThrow();

    // Empty slideStructure should also fail (min 1)
    expect(() =>
      strategistAgentDefinition.outputSchema.parse({
        goal: 'g',
        audience: 'a',
        angle: 'angle-1',
        hookDirections: ['h1'],
        slideStructure: [],
        ctaStrategy: 'cta',
      }),
    ).toThrow();
  });

  it('Copywriter output enforces slide headline maxLength (template constraint)', () => {
    const tooLongHeadline = 'A'.repeat(61);
    expect(() =>
      copywriterAgentDefinition.outputSchema.parse({
        slides: [{ index: 1, headline: tooLongHeadline, body: 'body here' }],
        caption: 'caption',
        hashtags: ['#btc'],
      }),
    ).toThrow();

    // Exactly 60 should pass
    const okHeadline = 'B'.repeat(60);
    expect(() =>
      copywriterAgentDefinition.outputSchema.parse({
        slides: [{ index: 1, headline: okHeadline, body: 'body here' }],
        caption: 'caption',
        hashtags: ['#btc'],
      }),
    ).not.toThrow();
  });

  it('ResearchAgent buildMessages includes system prompt and query', () => {
    const gateway = mockGateway();
    const toolRegistry = mockToolRegistry();
    const logger = mockLogger();
    const agent = new ResearchAgent(gateway, toolRegistry, logger);

    const msgs = agent.buildMessagesPublic({ query: 'BTC outlook', maxSources: 5 }, ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toContain('Research Agent');
    expect(msgs[1]!.content).toContain('BTC outlook');
  });
});
