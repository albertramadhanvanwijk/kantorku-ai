export * from './research.agent.js';
export * from './contentStrategist.agent.js';
export * from './copywriter.agent.js';
export * from './materialClassifier.agent.js';
export * from './chartExtractor.agent.js';
export * from './textExtractor.agent.js';
export * from './tradeParser.agent.js';

import type { AgentRegistry } from '../registry.js';
import type { AgentService } from '../agent.service.js';
import type { NineRouterGateway } from '../../gateway/nineRouter.gateway.js';
import type { ToolRegistry } from '../../tools/registry.js';
import type { Logger } from '../../../logger.js';
import { researchAgentDefinition, ResearchAgent } from './research.agent.js';
import { strategistAgentDefinition, ContentStrategistAgent } from './contentStrategist.agent.js';
import { copywriterAgentDefinition, CopywriterAgent } from './copywriter.agent.js';
import { materialClassifierDefinition, MaterialClassifierAgent } from './materialClassifier.agent.js';
import { chartExtractorDefinition, ChartExtractorAgent } from './chartExtractor.agent.js';
import { textExtractorDefinition, TextExtractorAgent } from './textExtractor.agent.js';
import { tradeParserDefinition, TradeParserAgent } from './tradeParser.agent.js';

export const ALL_AGENT_DEFINITIONS = [
  researchAgentDefinition,
  strategistAgentDefinition,
  copywriterAgentDefinition,
  materialClassifierDefinition,
  chartExtractorDefinition,
  textExtractorDefinition,
  tradeParserDefinition,
] as const;

/**
 * Register the three Phase-2 concrete agents into a registry and wire their
 * factories into an AgentService. Idempotent — re-calling overwrites the
 * factory entry and re-registers the definition (registry handles version sort).
 *
 * Call this from app wiring (Task 9) after constructing gateway/toolRegistry/logger:
 *   registerConcreteAgents(registry, agentService, gateway, toolRegistry, logger);
 */
export function registerConcreteAgents(
  registry: AgentRegistry,
  agentService: AgentService,
  gateway: NineRouterGateway,
  toolRegistry: ToolRegistry,
  logger: Logger,
): void {
  for (const def of ALL_AGENT_DEFINITIONS) {
    registry.register(def);
  }

  agentService.registerFactory(researchAgentDefinition.id, (gw, tr, lg) => new ResearchAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(strategistAgentDefinition.id, (gw, tr, lg) => new ContentStrategistAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(copywriterAgentDefinition.id, (gw, tr, lg) => new CopywriterAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(materialClassifierDefinition.id, (gw, tr, lg) => new MaterialClassifierAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(chartExtractorDefinition.id, (gw, tr, lg) => new ChartExtractorAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(textExtractorDefinition.id, (gw, tr, lg) => new TextExtractorAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);
  agentService.registerFactory(tradeParserDefinition.id, (gw, tr, lg) => new TradeParserAgent(gw, tr, lg) as unknown as import('../baseAgent.js').BaseAgent<unknown, unknown>);

  // Keep parameters referenced to satisfy strict TS when gateway/toolRegistry/logger are
  // supplied by the caller but factories close over the service's own instances.
  void gateway;
  void toolRegistry;
  void logger;
}
