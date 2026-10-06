import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/strategist.v1.js';
import { researchOutputSchema } from './research.agent.js';

export const strategistInputSchema = z.object({
  research: researchOutputSchema,
  contentCategory: z.string().min(1),
  brandVoice: z.unknown().optional(),
});

export const strategistOutputSchema = z.object({
  goal: z.string().min(1),
  audience: z.string().min(1),
  angle: z.string().min(1),
  hookDirections: z.array(z.string().min(1)).min(1),
  slideStructure: z.array(
    z.object({
      index: z.number().int().min(1),
      purpose: z.string().min(1),
    }),
  ).min(1),
  ctaStrategy: z.string().min(1),
});

export type StrategistInput = z.infer<typeof strategistInputSchema>;
export type StrategistOutput = z.infer<typeof strategistOutputSchema>;

export const strategistAgentDefinition: AgentDefinition = {
  id: 'content-strategist-agent',
  name: 'Content Strategist Agent',
  version: '1.0.0',
  role: 'Content Strategist',
  purpose: 'Turn research/analysis into a content angle — goal, audience, angle, hook directions, slide structure, CTA strategy.',
  inputSchema: strategistInputSchema,
  outputSchema: strategistOutputSchema,
  allowedTools: [],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'strategy',
  config: {},
};

export class ContentStrategistAgent extends BaseAgent<StrategistInput, StrategistOutput> {
  readonly definition: AgentDefinition = strategistAgentDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(input: StrategistInput, _ctx: AgentContext): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(input: StrategistInput, ctx: AgentContext): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
