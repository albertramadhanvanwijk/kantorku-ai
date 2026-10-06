import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/research.v1.js';

export const researchInputSchema = z.object({
  query: z.string().min(1),
  maxSources: z.number().int().min(1).max(10).default(5),
  recencyDays: z.number().int().min(1).max(365).optional(),
});

export const researchOutputSchema = z.object({
  sources: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1),
      publishedAt: z.string().optional(),
      excerpt: z.string().min(1),
    }),
  ),
  summary: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  provenance: z.array(z.string()),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const researchAgentDefinition: AgentDefinition = {
  id: 'research-agent',
  name: 'Research Agent',
  version: '1.0.0',
  role: 'Research Agent',
  purpose: 'Collect relevant factual information and sources; preserve URLs, distinguish fact from interpretation, note freshness.',
  inputSchema: researchInputSchema,
  outputSchema: researchOutputSchema,
  allowedTools: ['web_search', 'fetch_url'],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'research',
  config: {},
};

export class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  readonly definition: AgentDefinition = researchAgentDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(input: ResearchInput, _ctx: AgentContext): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  // Exposed for unit tests without breaking encapsulation via any-cast elsewhere
  public buildMessagesPublic(input: ResearchInput, ctx: AgentContext): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
