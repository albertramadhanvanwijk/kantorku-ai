import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/copywriter.v1.js';
import { strategistOutputSchema } from './contentStrategist.agent.js';

export const copywriterInputSchema = z.object({
  strategy: strategistOutputSchema,
  template: z.unknown().optional(),
  tradingDna: z.unknown().optional(),
});

export const copywriterOutputSchema = z.object({
  slides: z.array(
    z.object({
      index: z.number().int().min(1),
      headline: z.string().max(60),
      body: z.string().min(1),
    }),
  ).min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)),
});

export type CopywriterInput = z.infer<typeof copywriterInputSchema>;
export type CopywriterOutput = z.infer<typeof copywriterOutputSchema>;

export const copywriterAgentDefinition: AgentDefinition = {
  id: 'copywriter-agent',
  name: 'Copywriter Agent',
  version: '1.0.0',
  role: 'Copywriter',
  purpose: 'Write slide copy and caption; respect Trading DNA, avoid unsupported claims, fit template constraints.',
  inputSchema: copywriterInputSchema,
  outputSchema: copywriterOutputSchema,
  allowedTools: [],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'copywriting',
  config: {},
};

export class CopywriterAgent extends BaseAgent<CopywriterInput, CopywriterOutput> {
  readonly definition: AgentDefinition = copywriterAgentDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(input: CopywriterInput, _ctx: AgentContext): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(input: CopywriterInput, ctx: AgentContext): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
