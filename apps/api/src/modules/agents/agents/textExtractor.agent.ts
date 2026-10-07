import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/textExtractor.v1.js';

export const textExtractorInputSchema = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(1),
});

export const textExtractorOutputSchema = z.object({
  extractedText: z.string().min(1),
  language: z.string().optional(),
  structure: z.string().optional(),
  entities: z.array(z.string()).default([]),
});

export type TextExtractorInput = z.infer<typeof textExtractorInputSchema>;
export type TextExtractorOutput = z.infer<typeof textExtractorOutputSchema>;

export const textExtractorDefinition: AgentDefinition = {
  id: 'text-content-extractor',
  name: 'Text Content Extractor',
  version: '1.0.0',
  role: 'Text Content Extractor',
  purpose: 'OCR and extract faithful textual content from documents/images; structured JSON only, never fabricate unsupported values.',
  inputSchema: textExtractorInputSchema,
  outputSchema: textExtractorOutputSchema,
  allowedTools: ['fetch_url'],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'research',
  config: {},
};

export class TextExtractorAgent extends BaseAgent<TextExtractorInput, TextExtractorOutput> {
  readonly definition: AgentDefinition = textExtractorDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(
    input: TextExtractorInput,
    _ctx: AgentContext,
  ): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(
    input: TextExtractorInput,
    ctx: AgentContext,
  ): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
