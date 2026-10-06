// Spec §5.1 — no logic, types only
export type ModelCapability =
  | 'reasoning'
  | 'structured-output'
  | 'vision'
  | 'function-calling'
  | 'long-context';

export interface ModelSpec {
  id: string;
  name: string;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: ModelCapability[];
}

export interface ChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    name?: string;
  }>;
  tools?: unknown[];
  responseFormat?: { type: 'json_object' | 'json_schema'; schema?: unknown };
  temperature?: number;
  maxTokens?: number;
  correlationId?: string;
}

export interface ChatResponse {
  model: string;
  provider: '9router';
  content: string;
  parsedJson?: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
  latencyMs: number;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
}

export interface RoutingPolicy {
  taskType: string;
  preferredModels: string[];
  fallbackModels: string[];
  maxCostPerRunUsd?: number;
  maxLatencyMs?: number;
  requireCapabilities?: ModelCapability[];
}
