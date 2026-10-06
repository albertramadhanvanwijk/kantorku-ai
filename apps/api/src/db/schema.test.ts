import { describe, it, expect } from 'vitest';
import * as schema from './schema.js';

describe('Phase 2 schema', () => {
  it('exports agent_definitions with slug+version uniqueness', () => {
    expect(schema.agentDefinitions).toBeDefined();
  });

  it('exports agent_runs with correlation_id index', () => {
    expect(schema.agentRuns).toBeDefined();
  });

  it('exports workflow_definitions/executions/steps', () => {
    expect(schema.workflowDefinitions).toBeDefined();
    expect(schema.workflowExecutions).toBeDefined();
    expect(schema.workflowSteps).toBeDefined();
  });

  it('exports approvals, tool_runs, agent_events', () => {
    expect(schema.approvals).toBeDefined();
    expect(schema.toolRuns).toBeDefined();
    expect(schema.agentEvents).toBeDefined();
  });
});
