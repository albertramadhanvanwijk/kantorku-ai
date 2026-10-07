import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/tradeParser.v1.js';

export const tradeParserInputSchema = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(1),
  extractedText: z.string().optional(),
});

export const tradeSchema = z.object({
  instrument: z.string().min(1),
  direction: z.enum(['long', 'short']),
  entry: z.number().optional(),
  exit: z.number().optional(),
  sl: z.number().optional(),
  tp: z.number().optional(),
  timeframe: z.string().optional(),
  result: z.string().optional(),
  openedAt: z.string().optional(),
  closedAt: z.string().optional(),
  notes: z.string().optional(),
});

export const tradeParserOutputSchema = z.object({
  trades: z.array(tradeSchema).default([]),
});

export type TradeParserInput = z.infer<typeof tradeParserInputSchema>;
export type TradeParserOutput = z.infer<typeof tradeParserOutputSchema>;

export const tradeParserDefinition: AgentDefinition = {
  id: 'trade-data-parser',
  name: 'Trade Data Parser',
  version: '1.0.0',
  role: 'Trade Data Parser',
  purpose: 'Parse normalized trade records from screenshots/documents; structured JSON only, never fabricate unsupported trades or values.',
  inputSchema: tradeParserInputSchema,
  outputSchema: tradeParserOutputSchema,
  allowedTools: ['fetch_url'],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'strategy',
  config: {},
};

export class TradeParserAgent extends BaseAgent<TradeParserInput, TradeParserOutput> {
  readonly definition: AgentDefinition = tradeParserDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(
    input: TradeParserInput,
    _ctx: AgentContext,
  ): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(
    input: TradeParserInput,
    ctx: AgentContext,
  ): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
