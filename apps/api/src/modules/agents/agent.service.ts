import * as shared from '@kantorku/shared';
import type { Logger } from '../../logger.js';
import type { NineRouterGateway } from '../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../tools/registry.js';
import { AgentRegistry } from './registry.js';
import { BaseAgent } from './baseAgent.js';
import type { AgentContext, AgentDefinition, AgentRunResult } from './types.js';

/**
 * Minimal runLogger interface — real persistence is Task 6.
 * In tests a no-op implementation is injected.
 */
export interface AgentRunLogger {
  logAgentRun(record: {
    agentDefinitionId: string;
    modelProvider: string;
    modelName: string;
    promptVersion: string;
    status: 'completed' | 'failed';
    input: unknown;
    output?: unknown;
    usageMetadata?: unknown;
    latencyMs: number;
    errorMetadata?: unknown;
    correlationId: string;
    workflowExecutionId?: string;
    stepId?: string;
  }): Promise<string>;
}

export class NoopRunLogger implements AgentRunLogger {
  async logAgentRun(_record: Parameters<AgentRunLogger['logAgentRun']>[0]): Promise<string> {
    return 'noop-id';
  }
}

type AgentFactory = (
  gateway: NineRouterGateway,
  toolRegistry: ToolRegistry,
  logger: Logger,
  definition: AgentDefinition,
) => BaseAgent<unknown, unknown>;

/**
 * AgentService resolves AgentDefinition via AgentRegistry and instantiates
 * a concrete BaseAgent via a factory map. Concrete agent classes (Task 5)
 * will self-register their factories via registerFactory() or via the
 * constructor's factoryMap argument.
 */
export class AgentService {
  private readonly factories = new Map<string, AgentFactory>();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly gateway: NineRouterGateway,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
    private readonly runLogger: AgentRunLogger = new NoopRunLogger(),
  ) {}

  /**
   * Register a factory for an agent id. Overwrites existing.
   * Called at wiring time after concrete agents are imported.
   */
  registerFactory(agentId: string, factory: AgentFactory): void {
    this.factories.set(agentId, factory);
  }

  /**
   * Resolve definition and run the concrete agent.
   * Throws NOT_FOUND if agentId unknown.
   */
  async run(
    agentId: string,
    input: unknown,
    ctx: AgentContext,
  ): Promise<AgentRunResult<unknown>> {
    const def = this.registry.get(agentId);
    if (!def) {
      throw shared.notFound(`Agent not found: ${agentId}`);
    }

    const factory = this.factories.get(agentId);
    let agent: BaseAgent<unknown, unknown>;

    if (factory) {
      agent = factory(this.gateway, this.toolRegistry, this.logger, def);
    } else {
      // Fallback: instantiate a generic concrete agent that uses the
      // definition's schemas and systemPrompt directly. This allows Task 4
      // tests to exercise AgentService without Task 5 concrete classes.
      agent = new GenericAgent(def, this.gateway, this.toolRegistry, this.logger);
    }

    const start = Date.now();
    try {
      const result = await agent.run(input, ctx);
      // Best-effort persistence — do not fail the run if logging fails
      try {
        await this.runLogger.logAgentRun({
          agentDefinitionId: def.id,
          modelProvider: result.provider,
          modelName: result.model,
          promptVersion: def.promptVersion,
          status: 'completed',
          input,
          output: result.output,
          usageMetadata: result.usage,
          latencyMs: result.latencyMs,
          correlationId: ctx.correlationId,
          workflowExecutionId: ctx.workflowExecutionId,
          stepId: ctx.stepId,
        });
      } catch (logErr: unknown) {
        this.logger.warn(
          { err: String(logErr), agentId, correlationId: ctx.correlationId },
          'runLogger.logAgentRun failed after successful agent run',
        );
      }
      return result;
    } catch (err: unknown) {
      // Log failed run as well (best-effort)
      const latencyMs = Date.now() - start;
      const errorMeta =
        err instanceof shared.AppError
          ? { code: err.code, message: err.message, details: err.details }
          : { message: err instanceof Error ? err.message : String(err) };
      try {
        await this.runLogger.logAgentRun({
          agentDefinitionId: def.id,
          modelProvider: '9router',
          modelName: def.modelPolicy,
          promptVersion: def.promptVersion,
          status: 'failed',
          input,
          usageMetadata: undefined,
          latencyMs,
          errorMetadata: errorMeta,
          correlationId: ctx.correlationId,
          workflowExecutionId: ctx.workflowExecutionId,
          stepId: ctx.stepId,
        });
      } catch {
        // ignore
      }
      throw err;
    }
  }
}

/**
 * Generic agent used when no factory is registered. Delegates everything
 * to BaseAgent via the stored definition.
 */
class GenericAgent extends BaseAgent<unknown, unknown> {
  readonly definition: AgentDefinition;

  constructor(
    definition: AgentDefinition,
    gateway: NineRouterGateway,
    toolRegistry: ToolRegistry,
    logger: Logger,
  ) {
    super(gateway, toolRegistry, logger);
    this.definition = definition;
  }

  protected buildMessages(
    input: unknown,
    _ctx: AgentContext,
  ): { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] {
    return [
      { role: 'system', content: this.definition.systemPrompt },
      { role: 'user', content: JSON.stringify(input) },
    ];
  }
}
