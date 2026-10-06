import type { z } from 'zod';
import type { ChatResponse } from '../gateway/nineRouter.types.js';

export interface AgentContext {
  correlationId: string;
  workflowExecutionId?: string;
  stepId?: string;
  userId?: string;
  attempt?: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  role: string;
  purpose: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  allowedTools: string[];
  systemPrompt: string;
  promptVersion: string;
  modelPolicy: string;
  config: Record<string, unknown>;
}

export interface AgentRunResult<T> {
  output: T;
  usage?: ChatResponse['usage'];
  latencyMs: number;
  model: string;
  provider: '9router';
}
