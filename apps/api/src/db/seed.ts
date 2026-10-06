import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, and } from 'drizzle-orm';
import {
  agentDefinitions,
  workflowDefinitions,
} from './schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { researchInputSchema, researchOutputSchema, researchAgentDefinition } from '../modules/agents/agents/research.agent.js';
import { strategistInputSchema, strategistOutputSchema, strategistAgentDefinition } from '../modules/agents/agents/contentStrategist.agent.js';
import { copywriterInputSchema, copywriterOutputSchema, copywriterAgentDefinition } from '../modules/agents/agents/copywriter.agent.js';
import { SYSTEM_PROMPT as researchPrompt, PROMPT_VERSION as researchPromptVersion } from '../modules/agents/prompts/research.v1.js';
import { SYSTEM_PROMPT as strategistPrompt, PROMPT_VERSION as strategistPromptVersion } from '../modules/agents/prompts/strategist.v1.js';
import { SYSTEM_PROMPT as copywriterPrompt, PROMPT_VERSION as copywriterPromptVersion } from '../modules/agents/prompts/copywriter.v1.js';

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Seed: Phase 2 agent definitions and workflow definitions');

  // ── Seed agent_definitions (idempotent via onConflictDoNothing) ──

  // Research Agent
  const researchInputJsonSchema = zodToJsonSchema(researchInputSchema, { target: 'jsonSchema7' });
  const researchOutputJsonSchema = zodToJsonSchema(researchOutputSchema, { target: 'jsonSchema7' });

  await db
    .insert(agentDefinitions)
    .values({
      slug: researchAgentDefinition.id,
      version: researchAgentDefinition.version,
      name: researchAgentDefinition.name,
      role: researchAgentDefinition.role,
      purpose: researchAgentDefinition.purpose,
      inputSchema: researchInputJsonSchema,
      outputSchema: researchOutputJsonSchema,
      allowedTools: researchAgentDefinition.allowedTools,
      systemPrompt: researchPrompt,
      promptVersion: researchPromptVersion,
      modelPolicy: researchAgentDefinition.modelPolicy,
      config: researchAgentDefinition.config,
    })
    .onConflictDoNothing({ target: [agentDefinitions.slug, agentDefinitions.version] });

  // Content Strategist Agent
  const strategistInputJsonSchema = zodToJsonSchema(strategistInputSchema, { target: 'jsonSchema7' });
  const strategistOutputJsonSchema = zodToJsonSchema(strategistOutputSchema, { target: 'jsonSchema7' });

  await db
    .insert(agentDefinitions)
    .values({
      slug: strategistAgentDefinition.id,
      version: strategistAgentDefinition.version,
      name: strategistAgentDefinition.name,
      role: strategistAgentDefinition.role,
      purpose: strategistAgentDefinition.purpose,
      inputSchema: strategistInputJsonSchema,
      outputSchema: strategistOutputJsonSchema,
      allowedTools: strategistAgentDefinition.allowedTools,
      systemPrompt: strategistPrompt,
      promptVersion: strategistPromptVersion,
      modelPolicy: strategistAgentDefinition.modelPolicy,
      config: strategistAgentDefinition.config,
    })
    .onConflictDoNothing({ target: [agentDefinitions.slug, agentDefinitions.version] });

  // Copywriter Agent
  const copywriterInputJsonSchema = zodToJsonSchema(copywriterInputSchema, { target: 'jsonSchema7' });
  const copywriterOutputJsonSchema = zodToJsonSchema(copywriterOutputSchema, { target: 'jsonSchema7' });

  await db
    .insert(agentDefinitions)
    .values({
      slug: copywriterAgentDefinition.id,
      version: copywriterAgentDefinition.version,
      name: copywriterAgentDefinition.name,
      role: copywriterAgentDefinition.role,
      purpose: copywriterAgentDefinition.purpose,
      inputSchema: copywriterInputJsonSchema,
      outputSchema: copywriterOutputJsonSchema,
      allowedTools: copywriterAgentDefinition.allowedTools,
      systemPrompt: copywriterPrompt,
      promptVersion: copywriterPromptVersion,
      modelPolicy: copywriterAgentDefinition.modelPolicy,
      config: copywriterAgentDefinition.config,
    })
    .onConflictDoNothing({ target: [agentDefinitions.slug, agentDefinitions.version] });

  console.log('Seeded 3 agent definitions (research, content-strategist, copywriter)');

  // ── Seed workflow_definitions (idempotent via onConflictDoNothing) ──

  const workflowDef = {
    slug: 'content-production-v1',
    name: 'Content Production v1',
    version: '1.0.0',
    definition: {
      steps: [
        {
          id: 'research',
          agentId: 'research-agent',
          inputMapping: { type: 'fromWorkflowInput', path: '' },
          outputKey: 'research',
        },
        {
          id: 'strategist',
          agentId: 'content-strategist-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              research: { type: 'fromStepOutput', stepId: 'research', path: '' },
              contentCategory: { type: 'fromWorkflowInput', path: 'contentCategory' },
              brandVoice: { type: 'fromWorkflowInput', path: 'brandVoice' },
            },
          },
          outputKey: 'strategy',
        },
        {
          id: 'copywriter',
          agentId: 'copywriter-agent',
          inputMapping: {
            type: 'merge',
            mappings: {
              strategy: { type: 'fromStepOutput', stepId: 'strategist', path: '' },
              template: { type: 'fromWorkflowInput', path: 'template' },
              tradingDna: { type: 'fromWorkflowInput', path: 'tradingDna' },
            },
          },
          outputKey: 'copy',
        },
      ],
      edges: [
        { from: 'research', to: 'strategist' },
        { from: 'strategist', to: 'copywriter' },
      ],
      approvalGates: [], // No gates for happy path
    },
  };

  await db
    .insert(workflowDefinitions)
    .values({
      slug: workflowDef.slug,
      name: workflowDef.name,
      version: workflowDef.version,
      definition: workflowDef.definition,
    })
    .onConflictDoNothing({ target: [workflowDefinitions.slug, workflowDefinitions.version] });

  console.log('Seeded workflow definition: content-production-v1');

  await pool.end();
  console.log('Seed completed successfully');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});