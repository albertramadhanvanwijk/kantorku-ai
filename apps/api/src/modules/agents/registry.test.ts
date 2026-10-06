import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AgentRegistry } from './registry.js';
import type { AgentDefinition } from './types.js';

function makeDef(id: string, version: string, extra?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id,
    name: `${id}-${version}`,
    version,
    role: 'test-role',
    purpose: 'test-purpose',
    inputSchema: z.object({ query: z.string().min(1) }),
    outputSchema: z.object({ result: z.string() }),
    allowedTools: [],
    systemPrompt: 'You are a test agent',
    promptVersion: `${id}@${version}`,
    modelPolicy: 'research',
    config: {},
    ...extra,
  };
}

describe('AgentRegistry', () => {
  it('registers and retrieves by id/version', () => {
    const registry = new AgentRegistry();
    const defV1 = makeDef('research-agent', '1.0.0');
    registry.register(defV1);

    const got = registry.get('research-agent', '1.0.0');
    expect(got).toBeDefined();
    expect(got?.version).toBe('1.0.0');
    expect(got?.id).toBe('research-agent');
  });

  it('get without version returns latest', () => {
    const registry = new AgentRegistry();
    registry.register(makeDef('research-agent', '1.0.0'));
    registry.register(makeDef('research-agent', '2.0.0'));
    registry.register(makeDef('research-agent', '1.5.0'));

    const latest = registry.get('research-agent');
    expect(latest?.version).toBe('2.0.0');
  });

  it('does not mutate prior version on new register', () => {
    const registry = new AgentRegistry();
    const v1 = makeDef('research-agent', '1.0.0', { systemPrompt: 'prompt v1' });
    const v2 = makeDef('research-agent', '2.0.0', { systemPrompt: 'prompt v2' });
    registry.register(v1);
    registry.register(v2);

    const retrievedV1 = registry.get('research-agent', '1.0.0');
    expect(retrievedV1?.systemPrompt).toBe('prompt v1');
    expect(retrievedV1?.version).toBe('1.0.0');

    const all = registry.getAllVersions('research-agent');
    expect(all).toHaveLength(2);
    // Ensure v1 object wasn't mutated by v2 registration
    expect(all.find((d) => d.version === '1.0.0')?.systemPrompt).toBe('prompt v1');
  });

  it('list returns latest per id', () => {
    const registry = new AgentRegistry();
    registry.register(makeDef('research-agent', '1.0.0'));
    registry.register(makeDef('research-agent', '2.0.0'));
    registry.register(makeDef('copywriter-agent', '1.0.0'));

    const listed = registry.list();
    expect(listed).toHaveLength(2);
    const research = listed.find((d) => d.id === 'research-agent');
    expect(research?.version).toBe('2.0.0');
  });

  it('getAllVersions returns sorted versions', () => {
    const registry = new AgentRegistry();
    registry.register(makeDef('my-agent', '2.0.0'));
    registry.register(makeDef('my-agent', '1.0.0'));
    registry.register(makeDef('my-agent', '1.10.0'));

    const all = registry.getAllVersions('my-agent');
    expect(all.map((d) => d.version)).toEqual(['1.0.0', '1.10.0', '2.0.0']);
  });

  it('returns undefined for unknown id', () => {
    const registry = new AgentRegistry();
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.getAllVersions('unknown')).toEqual([]);
  });
});
