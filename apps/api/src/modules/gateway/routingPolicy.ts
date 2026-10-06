import * as shared from '@kantorku/shared';
import type { ModelCapability, ModelSpec, RoutingPolicy } from './nineRouter.types.js';

// Stub cost tiers (per 1k tokens) — sufficient for budget guard tests
const COST_LOW = 0.001;
const COST_MID = 0.005;
const COST_STRONG = 0.02;

// In-memory model catalog seeded per Spec §5.3
// ids follow "<tier>-<task>-v1" convention used by tests
const MODEL_CATALOG: Record<string, ModelSpec> = {
  // research: preferred mid
  'mid-research-v1': {
    id: 'mid-research-v1',
    name: 'Mid Research v1',
    maxTokens: 8192,
    costPer1kInput: COST_MID,
    costPer1kOutput: COST_MID,
    capabilities: ['reasoning', 'structured-output', 'long-context'],
  },
  'mid-research-vision-v1': {
    id: 'mid-research-vision-v1',
    name: 'Mid Research Vision v1',
    maxTokens: 8192,
    costPer1kInput: COST_MID,
    costPer1kOutput: COST_MID,
    capabilities: ['reasoning', 'structured-output', 'vision', 'long-context'],
  },
  'low-research-v1': {
    id: 'low-research-v1',
    name: 'Low Research v1',
    maxTokens: 4096,
    costPer1kInput: COST_LOW,
    costPer1kOutput: COST_LOW,
    capabilities: ['structured-output'],
  },
  // strategy: preferred mid
  'mid-strategy-v1': {
    id: 'mid-strategy-v1',
    name: 'Mid Strategy v1',
    maxTokens: 8192,
    costPer1kInput: COST_MID,
    costPer1kOutput: COST_MID,
    capabilities: ['reasoning', 'structured-output'],
  },
  'low-strategy-v1': {
    id: 'low-strategy-v1',
    name: 'Low Strategy v1',
    maxTokens: 4096,
    costPer1kInput: COST_LOW,
    costPer1kOutput: COST_LOW,
    capabilities: ['structured-output'],
  },
  // copywriting: preferred mid
  'mid-copywriting-v1': {
    id: 'mid-copywriting-v1',
    name: 'Mid Copywriting v1',
    maxTokens: 4096,
    costPer1kInput: COST_MID,
    costPer1kOutput: COST_MID,
    capabilities: ['structured-output'],
  },
  'low-copywriting-v1': {
    id: 'low-copywriting-v1',
    name: 'Low Copywriting v1',
    maxTokens: 4096,
    costPer1kInput: COST_LOW,
    costPer1kOutput: COST_LOW,
    capabilities: ['structured-output'],
  },
  // qa / risk: preferred stronger, fallback mid
  'strong-qa-v1': {
    id: 'strong-qa-v1',
    name: 'Strong QA v1',
    maxTokens: 8192,
    costPer1kInput: COST_STRONG,
    costPer1kOutput: COST_STRONG,
    capabilities: ['reasoning', 'structured-output', 'long-context'],
  },
  'mid-qa-v1': {
    id: 'mid-qa-v1',
    name: 'Mid QA v1',
    maxTokens: 8192,
    costPer1kInput: COST_MID,
    costPer1kOutput: COST_MID,
    capabilities: ['reasoning', 'structured-output'],
  },
  'low-qa-v1': {
    id: 'low-qa-v1',
    name: 'Low QA v1',
    maxTokens: 4096,
    costPer1kInput: COST_LOW,
    costPer1kOutput: COST_LOW,
    capabilities: ['structured-output'],
  },
  // classification: low-cost only
  'low-classification-v1': {
    id: 'low-classification-v1',
    name: 'Low Classification v1',
    maxTokens: 2048,
    costPer1kInput: COST_LOW,
    costPer1kOutput: COST_LOW,
    capabilities: ['structured-output', 'function-calling'],
  },
};

export const DEFAULT_POLICIES: Record<string, RoutingPolicy> = {
  research: {
    taskType: 'research',
    preferredModels: ['mid-research-v1', 'mid-research-vision-v1'],
    fallbackModels: ['low-research-v1'],
  },
  strategy: {
    taskType: 'strategy',
    preferredModels: ['mid-strategy-v1'],
    fallbackModels: ['low-strategy-v1'],
  },
  copywriting: {
    taskType: 'copywriting',
    preferredModels: ['mid-copywriting-v1'],
    fallbackModels: ['low-copywriting-v1'],
  },
  qa: {
    taskType: 'qa',
    preferredModels: ['strong-qa-v1'],
    fallbackModels: ['mid-qa-v1', 'low-qa-v1'],
  },
  classification: {
    taskType: 'classification',
    preferredModels: ['low-classification-v1'],
    fallbackModels: [],
  },
};

function hasCapabilities(spec: ModelSpec, required: ModelCapability[]): boolean {
  return required.every((c) => spec.capabilities.includes(c));
}

export function selectModel(
  taskType: string,
  opts?: { requiredCapabilities?: ModelCapability[]; maxCostPerRunUsd?: number },
): string {
  const policy = DEFAULT_POLICIES[taskType];
  if (!policy) throw shared.notFound(`Unknown taskType: ${taskType}`);

  const required = opts?.requiredCapabilities ?? [];

  // Filter helper
  const satisfies = (modelId: string): boolean => {
    const spec = MODEL_CATALOG[modelId];
    if (!spec) return false;
    if (required.length > 0 && !hasCapabilities(spec, required)) return false;
    return true;
  };

  // Pick first preferred satisfying requiredCapabilities
  let chosen: string | undefined = policy.preferredModels.find(satisfies);
  // Else first fallback satisfying
  if (!chosen) chosen = policy.fallbackModels.find(satisfies);

  if (!chosen) throw shared.notFound(`No model satisfies capabilities for ${taskType}`);

  // Budget check — derive per-run cost as (costPer1kInput + costPer1kOutput)
  // This keeps test arithmetic simple: low=0.002, mid=0.01, strong=0.04
  if (opts?.maxCostPerRunUsd !== undefined) {
    const spec = MODEL_CATALOG[chosen];
    if (spec) {
      const projected = spec.costPer1kInput + spec.costPer1kOutput;
      if (projected > opts.maxCostPerRunUsd) {
        // Check if any cheaper alternative satisfies but was not preferred order — no, policy already ordered cheapest last
        // So if chosen is already over budget, throw
        throw shared.budgetExceeded(
          `BUDGET_EXCEEDED: model ${chosen} cost ${projected} exceeds budget ${opts.maxCostPerRunUsd}`,
          {
            model: chosen,
            projected,
            budget: opts.maxCostPerRunUsd,
          },
        );
      }
    }
  }

  return chosen;
}

export { MODEL_CATALOG };
