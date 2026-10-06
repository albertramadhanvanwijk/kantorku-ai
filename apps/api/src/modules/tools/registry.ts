import { z } from 'zod';
import * as shared from '@kantorku/shared';
import { AppError } from '@kantorku/shared';

export interface AgentContext {
  correlationId: string;
  workflowExecutionId?: string;
  stepId?: string;
  userId?: string;
  attempt?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute(input: unknown, ctx: AgentContext): Promise<unknown>;
}

export class ToolRegistry {
  private readonly handlers = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.handlers.set(handler.definition.name, handler);
  }

  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  getMany(names: string[]): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const name of names) {
      const handler = this.handlers.get(name);
      if (handler) defs.push(handler.definition);
    }
    return defs;
  }

  async execute(
    name: string,
    input: unknown,
    ctx: AgentContext,
  ): Promise<{ output: unknown; latencyMs: number }> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw shared.notFound(`Tool not found: ${name}`);
    }

    const start = Date.now();

    let parsedInput: unknown;
    try {
      parsedInput = handler.definition.inputSchema.parse(input);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw shared.validationError(`Invalid input for tool ${name}`, {
          issues: err.issues,
        });
      }
      throw err;
    }

    let rawOutput: unknown;
    try {
      rawOutput = await handler.execute(parsedInput, ctx);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      // Preserve ZodError from handler execute if handler also validates?
      if (err instanceof z.ZodError) {
        throw shared.validationError(`Tool ${name} input validation failed inside handler`, {
          issues: err.issues,
        });
      }
      throw new AppError('SYSTEM_ERROR', (err as Error).message ?? `Tool ${name} failed`, 500, {
        cause: String(err),
      });
    }

    // Validate output against declared outputSchema
    try {
      const parsedOutput = handler.definition.outputSchema.parse(rawOutput);
      const latencyMs = Date.now() - start;
      return { output: parsedOutput, latencyMs };
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw shared.validationError(`Invalid output from tool ${name}`, {
          issues: err.issues,
        });
      }
      throw err;
    }
  }
}
