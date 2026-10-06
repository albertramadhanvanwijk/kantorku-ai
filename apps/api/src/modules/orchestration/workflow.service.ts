import * as shared from '@kantorku/shared';
import type { Logger } from '../../logger.js';
import type { ExecutionStore, WorkflowDefinitionRecord } from './executionStore.js';

/**
 * Minimal CRUD service for workflow definitions.
 * Per plan: may be minimal — delegates to ExecutionStore.
 */
export class WorkflowService {
  constructor(
    private readonly store: ExecutionStore,
    private readonly logger: Logger,
  ) {}

  async createWorkflow(record: {
    slug: string;
    name: string;
    version: string;
    definition: WorkflowDefinitionRecord['definition'];
  }): Promise<string> {
    // Validate definition has steps and no cycle (defer cycle check to engine topologicalSort)
    if (!record.definition.steps || record.definition.steps.length === 0) {
      throw shared.validationError('Workflow definition must have at least one step');
    }
    const ids = new Set(record.definition.steps.map((s) => s.id));
    for (const edge of record.definition.edges ?? []) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        throw shared.validationError(`Edge references unknown step: ${edge.from} -> ${edge.to}`);
      }
      if (edge.from === edge.to) {
        throw shared.validationError(`Self-loop edge not allowed: ${edge.from}`);
      }
    }
    this.logger.info({ slug: record.slug, version: record.version }, 'workflowService.createWorkflow');
    return this.store.createDefinition(record);
  }

  async getWorkflow(id: string): Promise<WorkflowDefinitionRecord> {
    return this.store.getDefinition(id);
  }

  async listWorkflows(filters?: {
    slug?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: WorkflowDefinitionRecord[]; total: number }> {
    return this.store.listDefinitions(filters);
  }
}
