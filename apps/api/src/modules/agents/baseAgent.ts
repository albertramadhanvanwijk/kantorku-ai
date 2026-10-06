import { z } from 'zod';
import * as shared from '@kantorku/shared';
import type { Logger } from '../../logger.js';
import type { NineRouterGateway } from '../gateway/nineRouter.gateway.js';
import type { ChatRequest } from '../gateway/nineRouter.types.js';
import { selectModel as policySelectModel } from '../gateway/routingPolicy.js';
import type { ToolDefinition } from '../tools/registry.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { AgentContext, AgentDefinition, AgentRunResult } from './types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly definition: AgentDefinition;

  constructor(
    protected readonly gateway: NineRouterGateway,
    protected readonly toolRegistry: ToolRegistry,
    protected readonly logger: Logger,
  ) {}

  protected abstract buildMessages(
    input: TInput,
    ctx: AgentContext,
  ): ChatRequest['messages'];

  protected selectModel(_ctx: AgentContext): string {
    // Policy key is definition.modelPolicy (e.g. 'research')
    return policySelectModel(this.definition.modelPolicy);
  }

  protected getTools(): ToolDefinition[] {
    return this.toolRegistry.getMany(this.definition.allowedTools);
  }

  async run(input: TInput, ctx: AgentContext): Promise<AgentRunResult<TOutput>> {
    // 1) Validate input
    let parsedInput: TInput;
    try {
      parsedInput = this.definition.inputSchema.parse(input) as TInput;
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw shared.validationError('Agent input validation failed', {
          agentId: this.definition.id,
          issues: err.issues,
        });
      }
      throw err;
    }

    // 2) Build messages
    const messages = this.buildMessages(parsedInput, ctx);

    // 3) Prepare json_schema
    const jsonSchema = zodToJsonSchema(this.definition.outputSchema, {
      target: 'jsonSchema7',
    });

    const model = this.selectModel(ctx);
    const tools = this.getTools();
    const startTotal = Date.now();

    // Helper to call gateway and attempt to validate output
    const callAndValidate = async (
      msgs: ChatRequest['messages'],
    ): Promise<{ output: TOutput; response: Awaited<ReturnType<NineRouterGateway['chat']>> }> => {
      const res = await this.gateway.chat(
        {
          model,
          messages: msgs,
          tools: tools.length > 0 ? (tools as unknown as ChatRequest['tools']) : undefined,
          responseFormat: { type: 'json_schema', schema: jsonSchema },
          correlationId: ctx.correlationId,
        },
        // Pass undefined policy — gateway fallback is via RoutingPolicy fallbackModels if needed;
        // model selection already resolved via selectModel.
        undefined,
      );

      // Parse content as JSON (never transition from unvalidated text)
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.content);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw shared.validationError('Agent output is not valid JSON', {
          agentId: this.definition.id,
          parseError: msg,
          contentPreview: res.content.slice(0, 500),
        });
      }

      // Validate against output schema
      try {
        const output = this.definition.outputSchema.parse(parsed) as TOutput;
        return { output, response: res };
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          throw shared.validationError('Agent output schema validation failed', {
            agentId: this.definition.id,
            issues: err.issues,
          });
        }
        throw err;
      }
    };

    try {
      const { output, response } = await callAndValidate(messages);
      const latencyMs = Date.now() - startTotal;
      return {
        output,
        usage: response.usage,
        latencyMs: response.latencyMs ?? latencyMs,
        model: response.model ?? model,
        provider: '9router',
      };
    } catch (err: unknown) {
      // One repair retry only, for VALIDATION_ERROR originating from output validation / JSON parse
      const isValidationError =
        err instanceof shared.AppError && err.code === 'VALIDATION_ERROR';
      if (!isValidationError) throw err;

      // Do not retry if the error was input validation (already thrown before gateway call)
      // But callAndValidate only throws validation for output, so safe to retry once.
      this.logger.debug(
        { agentId: this.definition.id, correlationId: ctx.correlationId },
        'agent output validation failed, attempting one repair retry',
      );

      // Build corrective message — per spec: "Your previous output failed schema validation: <issues>. Return ONLY valid JSON matching the schema."
      const issuesText =
        (err.details as { issues?: unknown } | undefined)?.issues !== undefined
          ? JSON.stringify((err.details as { issues: unknown }).issues)
          : err.message;

      // We need to capture the original raw content for the repair prompt — we don't have it directly
      // so we use issues text. The repair message is appended as a system message.
      const repairMessages: ChatRequest['messages'] = [
        ...messages,
        {
          role: 'system' as const,
          content: `Your previous output failed schema validation: ${issuesText}. Return ONLY valid JSON matching the schema. Do not include any explanation or markdown.`,
        },
      ];

      try {
        const { output, response } = await callAndValidate(repairMessages);
        const latencyMs = Date.now() - startTotal;
        return {
          output,
          usage: response.usage,
          latencyMs: response.latencyMs ?? latencyMs,
          model: response.model ?? model,
          provider: '9router',
        };
      } catch (retryErr: unknown) {
        // After one repair retry, surface VALIDATION_ERROR (do not attempt further retries)
        if (retryErr instanceof shared.AppError && retryErr.code === 'VALIDATION_ERROR') {
          throw retryErr;
        }
        // If gateway threw provider/timeout etc on retry, wrap as is
        throw retryErr;
      }
    }
  }
}
