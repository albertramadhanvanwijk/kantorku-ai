import { z } from 'zod';
import { BaseAgent } from '../baseAgent.js';
import type { AgentContext, AgentDefinition } from '../types.js';
import type { ChatRequest } from '../../gateway/nineRouter.types.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../prompts/materialClassifier.v1.js';
import { materialTypeSchema } from '@kantorku/shared';

export const materialClassifierInputSchema = z.object({
  fileUrl: z.string().url(),
  mimeType: z.string().min(1),
  userDeclaredType: materialTypeSchema.optional(),
});

export const materialClassifierOutputSchema = z.object({
  type: materialTypeSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export type MaterialClassifierInput = z.infer<typeof materialClassifierInputSchema>;
export type MaterialClassifierOutput = z.infer<typeof materialClassifierOutputSchema>;

export const materialClassifierDefinition: AgentDefinition = {
  id: 'material-classifier',
  name: 'Material Classifier Agent',
  version: '1.0.0',
  role: 'Material Classifier',
  purpose: 'Classify creator material into one of 7 types using vision/mime signals and optional user-declared type; never silently replace creator thesis; return type + confidence + 1-sentence reasoning.',
  inputSchema: materialClassifierInputSchema,
  outputSchema: materialClassifierOutputSchema,
  allowedTools: [],
  systemPrompt: SYSTEM_PROMPT,
  promptVersion: PROMPT_VERSION,
  modelPolicy: 'classification',
  config: {},
};

export class MaterialClassifierAgent extends BaseAgent<MaterialClassifierInput, MaterialClassifierOutput> {
  readonly definition: AgentDefinition = materialClassifierDefinition;

  constructor(gateway: NineRouterGateway, toolRegistry: ToolRegistry, logger: Logger) {
    super(gateway, toolRegistry, logger);
  }

  protected buildMessages(
    input: MaterialClassifierInput,
    _ctx: AgentContext,
  ): ChatRequest['messages'] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }

  public buildMessagesPublic(
    input: MaterialClassifierInput,
    ctx: AgentContext,
  ): ChatRequest['messages'] {
    return this.buildMessages(input, ctx);
  }
}
