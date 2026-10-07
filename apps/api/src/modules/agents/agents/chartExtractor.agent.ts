import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/chartExtractor.v1.js';

export const chartExtractorInputSchema = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(1),
});

export const chartExtractorOutputSchema = z.object({
  instrument: z.string().optional(),
  timeframe: z.string().optional(),
  indicators: z.array(z.string()).default([]),
  priceLevels: z.array(z.number()).default([]),
  chartType: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type ChartExtractorInput = z.infer<typeof chartExtractorInputSchema>;
export type ChartExtractorOutput = z.infer<typeof chartExtractorOutputSchema>;

export const chartExtractorDefinition: AgentDefinition = {
  id: 'chart-metadata-extractor',
  name: 'Chart Metadata Extractor',
  version: '1.0.0',
  role: 'Chart Metadata Extractor',
  purpose: 'Extract instrument, timeframe, indicators, price levels and chart type from a trading chart image; structured JSON only, never fabricate unsupported values.',
  inputSchema: chartExtractorInputSchema,
  outputSchema: chartExtractorOutputSchema,
  allowedTools: ['fetch_url'],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'research',
  config: {},
};

export class ChartExtractorAgent extends BaseAgent<ChartExtractorInput, ChartExtractorOutput> {
  readonly definition: AgentDefinition = chartExtractorDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(
    input: ChartExtractorInput,
    _ctx: AgentContext,
  ): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(
    input: ChartExtractorInput,
    ctx: AgentContext,
  ): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
