import type { AgentDefinition } from './types.js';

function compareVersions(a: string, b: string): number {
  // Simple semver compare: split on '.' and compare numeric parts
  const pa = a.split('.').map((p) => Number(p));
  const pb = b.split('.').map((p) => Number(p));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export class AgentRegistry {
  private readonly byId = new Map<string, AgentDefinition[]>();

  register(def: AgentDefinition): void {
    const existing = this.byId.get(def.id);
    if (!existing) {
      this.byId.set(def.id, [def]);
      return;
    }
    // Append and sort by version ascending (lexicographic via semver); latest is last
    existing.push(def);
    existing.sort((a, b) => compareVersions(a.version, b.version));
  }

  get(id: string, version?: string): AgentDefinition | undefined {
    const list = this.byId.get(id);
    if (!list || list.length === 0) return undefined;
    if (version !== undefined) {
      return list.find((d) => d.version === version);
    }
    // latest = last after sort
    return list[list.length - 1];
  }

  list(): AgentDefinition[] {
    const result: AgentDefinition[] = [];
    for (const [, defs] of this.byId) {
      const latest = defs[defs.length - 1];
      if (latest) result.push(latest);
    }
    return result;
  }

  getAllVersions(id: string): AgentDefinition[] {
    const list = this.byId.get(id);
    return list ? [...list] : [];
  }
}
