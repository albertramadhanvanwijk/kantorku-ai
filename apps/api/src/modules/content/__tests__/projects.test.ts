import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { MaterialsService } from '../../materials/materials.service.js';
import { SourcePacksService } from '../../materials/sourcePacks.service.js';
import { ContentProjectsService } from '../projects.service.js';
import { LocalStorageAdapter } from '../../materials/storage/local.adapter.js';
import type { Env } from '@kantorku/shared';
import { fileAssets, creatorMaterials, sourcePacks, sourcePackItems, contentProjects } from '../../../db/schema.js';

// ── Fake DB with content_projects ──────────────────────────────────────────
function makeContentProjectsFakeDb() {
  const fileAssetMap = new Map<string, Record<string, unknown>>();
  const materialMap = new Map<string, Record<string, unknown>>();
  const packMap = new Map<string, Record<string, unknown>>();
  const packItemMap = new Map<string, Record<string, unknown>>();
  const projectMap = new Map<string, Record<string, unknown>>();
  let counter = 90000;
  const nextId = () => `00000000-8000-4000-a000-${String(counter++).padStart(12, '0')}`;

  const tableKey = new WeakMap<object, string>();

  const fakeDb: any = {
    _fileAssets: fileAssetMap,
    _creatorMaterials: materialMap,
    _sourcePacks: packMap,
    _sourcePackItems: packItemMap,
    _contentProjects: projectMap,
    _nextId: nextId,
    _tableKey: tableKey,

    transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(fakeDb);
    },

    insert(table: unknown) {
      return {
        values(vals: Record<string, unknown> | Record<string, unknown>[]) {
          const arr = Array.isArray(vals) ? vals : [vals];
          const k = tableKey.get(table as object);
          const tableStr = k ?? 'unknown';
          const returning = () => {
            const out: Record<string, unknown>[] = [];
            for (const v of arr) {
              if (tableStr === 'file_assets') {
                const id = (v as any).id ?? nextId();
                const checksum = String((v as any).checksum ?? '');
                for (const existing of fileAssetMap.values()) {
                  if (String((existing as any).checksum) === checksum) {
                    const err: any = new Error(`duplicate key value violates unique constraint "file_assets_checksum_unique"`);
                    err.code = '23505';
                    throw err;
                  }
                }
                const row: Record<string, unknown> = { id, createdAt: new Date(), ...v };
                (row as any).uploadedBy = (v as any).uploadedBy ?? (v as any).uploaded_by;
                (row as any).storageDriver = (v as any).storageDriver ?? (v as any).storage_driver;
                fileAssetMap.set(String(id), row);
                out.push(row);
              } else if (tableStr === 'creator_materials') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), updatedAt: new Date(), ...v };
                (row as any).fileAssetId = (v as any).fileAssetId ?? (v as any).file_asset_id;
                materialMap.set(String(id), row);
                out.push(row);
              } else if (tableStr === 'source_packs') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), updatedAt: new Date(), ...v };
                (row as any).createdBy = (v as any).createdBy ?? (v as any).created_by;
                packMap.set(String(id), row);
                out.push(row);
              } else if (tableStr === 'source_pack_items') {
                const id = (v as any).id ?? nextId();
                const spId = String((v as any).sourcePackId ?? (v as any).source_pack_id ?? '');
                const mId = String((v as any).materialId ?? (v as any).material_id ?? '');
                for (const existing of packItemMap.values()) {
                  const eSp = String((existing as any).sourcePackId ?? (existing as any).source_pack_id ?? '');
                  const eM = String((existing as any).materialId ?? (existing as any).material_id ?? '');
                  if (eSp === spId && eM === mId) {
                    const err: any = new Error(`duplicate key value violates unique constraint "source_pack_items_pack_material_unique"`);
                    err.code = '23505';
                    throw err;
                  }
                }
                const row: Record<string, unknown> = { id, createdAt: new Date(), ...v };
                (row as any).sourcePackId = (v as any).sourcePackId ?? (v as any).source_pack_id;
                (row as any).materialId = (v as any).materialId ?? (v as any).material_id;
                (row as any).sortOrder = (v as any).sortOrder ?? (v as any).sort_order ?? 0;
                packItemMap.set(String(id), row);
                out.push(row);
              } else if (tableStr === 'content_projects') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), updatedAt: new Date(), ...v };
                (row as any).sourcePackId = (v as any).sourcePackId ?? (v as any).source_pack_id;
                (row as any).workflowExecutionId = (v as any).workflowExecutionId ?? (v as any).workflow_execution_id ?? null;
                (row as any).createdBy = (v as any).createdBy ?? (v as any).created_by;
                (row as any).mode = (v as any).mode;
                (row as any).status = (v as any).status ?? 'pending';
                projectMap.set(String(id), row);
                out.push(row);
              } else {
                out.push({ id: nextId(), ...v });
              }
            }
            return Promise.resolve(out);
          };
          const builder: any = {
            returning: () => returning(),
            then(onFulfilled: (v: any) => any) { return returning().then(onFulfilled); },
          };
          builder.onConflictDoNothing = () => {
            const wrappedReturning = async () => {
              try { return await returning(); } catch (err: any) {
                if (err?.code === '23505' || String(err?.message ?? '').includes('unique')) return [];
                throw err;
              }
            };
            return { then: (cb: any) => wrappedReturning().then(cb), returning: () => wrappedReturning() };
          };
          return builder;
        },
      };
    },

    select(_proj?: unknown) {
      return {
        from(table: unknown) {
          const k = tableKey.get(table as object);
          const tableStr = k ?? 'unknown';
          const allRows = (): Record<string, unknown>[] => {
            if (tableStr === 'file_assets') return Array.from(fileAssetMap.values());
            if (tableStr === 'creator_materials') return Array.from(materialMap.values());
            if (tableStr === 'source_packs') return Array.from(packMap.values());
            if (tableStr === 'source_pack_items') return Array.from(packItemMap.values());
            if (tableStr === 'content_projects') return Array.from(projectMap.values());
            return [];
          };
          const whereBuilder = (cond: unknown) => {
            let filterValue: string | null = null;
            let filterField: string | null = null;
            if (cond && typeof cond === 'object' && 'queryChunks' in (cond as any)) {
              const chunks = (cond as any).queryChunks as unknown[];
              for (const c of chunks) {
                if (c && typeof c === 'object' && 'name' in (c as any) && typeof (c as any).name === 'string') {
                  filterField = (c as any).name as string; break;
                }
              }
              for (const c of chunks) {
                if (c && typeof c === 'object' && (c as any).constructor?.name === 'Param') {
                  const v = (c as any).value;
                  if (typeof v === 'string') { filterValue = v; break; }
                }
              }
              if (!filterField && filterValue) {
                if (/^[0-9a-f]{8}-/.test(filterValue)) filterField = 'id';
                else filterField = 'checksum';
              }
            }
            const rows = allRows().filter((r) => {
              if (!filterValue || !filterField) return true;
              const variants = [filterField, filterField.replace(/([A-Z])/g, '_$1').toLowerCase(), filterField.toLowerCase()];
              for (const key of variants) if (String((r as any)[key] ?? '') === filterValue) return true;
              if (filterField === 'checksum' && String((r as any).checksum) === filterValue) return true;
              if (filterField === 'id' && String((r as any).id) === filterValue) return true;
              if (filterField === 'fileAssetId' || filterField === 'file_asset_id') if (String((r as any).fileAssetId ?? (r as any).file_asset_id ?? '') === filterValue) return true;
              if (filterField === 'sourcePackId' || filterField === 'source_pack_id') if (String((r as any).sourcePackId ?? (r as any).source_pack_id ?? '') === filterValue) return true;
              if (filterField === 'materialId' || filterField === 'material_id') if (String((r as any).materialId ?? (r as any).material_id ?? '') === filterValue) return true;
              if (filterField === 'createdBy' || filterField === 'created_by') if (String((r as any).createdBy ?? (r as any).created_by ?? '') === filterValue) return true;
              if (filterField === 'workflowExecutionId' || filterField === 'workflow_execution_id') if (String((r as any).workflowExecutionId ?? (r as any).workflow_execution_id ?? '') === filterValue) return true;
              return false;
            });
            const builder: any = {
              limit(n: number) {
                const sliced = rows.slice(0, n);
                const p: any = Promise.resolve(sliced);
                p.offset = (o: number) => Promise.resolve(rows.slice(o, o + n));
                return p;
              },
              offset(o: number) { return Promise.resolve(rows.slice(o)); },
            };
            const promise: any = Promise.resolve(rows);
            promise.limit = builder.limit;
            promise.offset = builder.offset;
            return Object.assign(promise, builder);
          };
          const base: any = {
            where: whereBuilder,
            limit(n: number) {
              const rows = allRows();
              const sliced = rows.slice(0, n);
              const p: any = Promise.resolve(sliced);
              p.offset = (o: number) => Promise.resolve(rows.slice(o, o + n));
              return p;
            },
            offset(o: number) { return Promise.resolve(allRows().slice(o)); },
          };
          const promise: any = Promise.resolve(allRows());
          promise.where = whereBuilder;
          promise.limit = base.limit;
          promise.offset = base.offset;
          return Object.assign(promise, base);
        },
      };
    },

    update(table: unknown) {
      return {
        set(patch: Record<string, unknown>) {
          return {
            where(_cond: unknown) {
              let targetId: string | null = null;
              if (_cond && typeof _cond === 'object' && 'queryChunks' in (_cond as any)) {
                for (const c of (_cond as any).queryChunks as unknown[]) {
                  if (c && typeof c === 'object' && (c as any).constructor?.name === 'Param') {
                    const v = (c as any).value;
                    if (typeof v === 'string' && /^[0-9a-f]{8}-/.test(v)) { targetId = v; break; }
                  }
                }
              }
              const k = tableKey.get(table as object);
              const tableStr = k ?? 'unknown';
              const apply = (map: Map<string, Record<string, unknown>>) => {
                if (targetId && map.has(targetId)) {
                  const row = map.get(targetId)!;
                  Object.assign(row, patch);
                  return [row];
                }
                for (const row of map.values()) Object.assign(row, patch);
                return Array.from(map.values()).slice(0, 1);
              };
              const returning = () => {
                let rows: Record<string, unknown>[] = [];
                if (tableStr === 'creator_materials') rows = apply(materialMap);
                else if (tableStr === 'file_assets') rows = apply(fileAssetMap);
                else if (tableStr === 'source_packs') rows = apply(packMap);
                else if (tableStr === 'content_projects') {
                  if (targetId && projectMap.has(targetId)) {
                    const row = projectMap.get(targetId)!;
                    Object.assign(row, patch);
                    return Promise.resolve([row]);
                  }
                  return Promise.resolve([]);
                } else if (tableStr === 'source_pack_items') {
                  if (targetId && packItemMap.has(targetId)) {
                    const row = packItemMap.get(targetId)!;
                    Object.assign(row, patch);
                    return Promise.resolve([row]);
                  }
                  return Promise.resolve([]);
                }
                return Promise.resolve(rows);
              };
              if (tableStr === 'content_projects' || tableStr === 'source_pack_items') {
                return {
                  returning: () => {
                    if (targetId && (tableStr === 'content_projects' ? projectMap : packItemMap).has(targetId)) {
                      const m = tableStr === 'content_projects' ? projectMap : packItemMap;
                      const row = m.get(targetId)!;
                      Object.assign(row, patch);
                      return Promise.resolve([row]);
                    }
                    return Promise.resolve([]);
                  },
                  then(onFulfilled: (v: any) => any) {
                    if (targetId && (tableStr === 'content_projects' ? projectMap : packItemMap).has(targetId)) {
                      const m = tableStr === 'content_projects' ? projectMap : packItemMap;
                      const row = m.get(targetId)!;
                      Object.assign(row, patch);
                      return Promise.resolve([row]).then(onFulfilled);
                    }
                    return Promise.resolve([]).then(onFulfilled);
                  },
                };
              }
              return { returning: () => returning(), then(onFulfilled: (v: any) => any) { return returning().then(onFulfilled); } };
            },
          };
        },
      };
    },

    delete(table: unknown) {
      return {
        where(_cond: unknown) {
          let targetId: string | null = null;
          let targetField: string | null = null;
          if (_cond && typeof _cond === 'object' && 'queryChunks' in (_cond as any)) {
            for (const c of (_cond as any).queryChunks as unknown[]) {
              if (c && typeof c === 'object' && 'name' in (c as any) && typeof (c as any).name === 'string') { targetField = (c as any).name as string; break; }
            }
            for (const c of (_cond as any).queryChunks as unknown[]) {
              if (c && typeof c === 'object' && (c as any).constructor?.name === 'Param') {
                const v = (c as any).value;
                if (typeof v === 'string') { targetId = v; break; }
              }
            }
          }
          const k = tableKey.get(table as object);
          const tableStr = k ?? 'unknown';
          const delFrom = (map: Map<string, Record<string, unknown>>, field?: string | null) => {
            if (targetId) {
              const fid: string | null = field as string | null;
              const isMaterial = (fid as any) === 'materialId' || (fid as any) === 'material_id';
              const isFileAsset = (fid as any) === 'fileAssetId' || (fid as any) === 'file_asset_id';
              const isSourcePack = (fid as any) === 'sourcePackId' || (fid as any) === 'source_pack_id';
              if (isMaterial) for (const [kk, v] of map.entries()) if (String((v as any).materialId ?? (v as any).material_id) === targetId) map.delete(kk);
              else if (isFileAsset) for (const [kk, v] of map.entries()) if (String((v as any).fileAssetId ?? (v as any).file_asset_id) === targetId) map.delete(kk);
              else if (isSourcePack) for (const [kk, v] of map.entries()) if (String((v as any).sourcePackId ?? (v as any).source_pack_id) === targetId) map.delete(kk);
              else map.delete(targetId);
            }
          };
          if (tableStr === 'creator_materials') delFrom(materialMap, targetField);
          else if (tableStr === 'file_assets') delFrom(fileAssetMap, targetField);
          else if (tableStr === 'source_packs') delFrom(packMap, targetField);
          else if (tableStr === 'source_pack_items') delFrom(packItemMap, targetField);
          else if (tableStr === 'content_projects') delFrom(projectMap, targetField);
          return Promise.resolve([]);
        },
      };
    },
  };

  return {
    fakeDb,
    fileAssetMap,
    materialMap,
    packMap,
    packItemMap,
    projectMap,
    tableKey,
    nextId,
    _wireTables: async () => {
      const schema = await import('../../../db/schema.js');
      tableKey.set(schema.fileAssets as unknown as object, 'file_assets');
      tableKey.set(schema.creatorMaterials as unknown as object, 'creator_materials');
      tableKey.set(schema.sourcePacks as unknown as object, 'source_packs');
      tableKey.set(schema.sourcePackItems as unknown as object, 'source_pack_items');
      tableKey.set(schema.contentProjects as unknown as object, 'content_projects');
      tableKey.set(schema.workflowDefinitions as unknown as object, 'workflow_definitions');
      tableKey.set(schema.workflowExecutions as unknown as object, 'workflow_executions');
      tableKey.set(schema.workflowSteps as unknown as object, 'workflow_steps');
      tableKey.set(schema.approvals as unknown as object, 'approvals');
      tableKey.set(schema.agentRuns as unknown as object, 'agent_runs');
      tableKey.set(schema.users as unknown as object, 'users');
    },
  };
}

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'silent' } as unknown as any;
}

function pngBuffer(seed = 'seed'): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, Buffer.from(`fake png ${seed} ${Math.random()}`)]);
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function createPackWithMaterials(fakeDb: any, storage: LocalStorageAdapter, userId: string, seeds: string[]): Promise<{ packId: string; materialIds: string[] }> {
  const matSvc = new MaterialsService({
    db: fakeDb,
    storage,
    logger: createMockLogger(),
    config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: (storage as any).baseDir ?? '/tmp', MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env,
  });
  const materialIds: string[] = [];
  for (const seed of seeds) {
    const buf = pngBuffer(seed);
    const { material } = await matSvc.upload(buf, { originalName: `${seed}.png`, mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'chart' });
    materialIds.push(String((material as any).id));
  }
  const packSvc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
  const pack = await packSvc.create({ name: `Pack ${seeds.join('-')}-${Date.now()}`, materialIds, userId });
  return { packId: String((pack as any).id), materialIds };
}

// ── Service unit tests ───────────────────────────────────────────────────
describe('ContentProjectsService', () => {
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeContentProjectsFakeDb>;
  let fakeDb: any;
  const userId = 'user-1';
  const otherUserId = 'user-2';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-content-proj-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeContentProjectsFakeDb();
    await fakeDbContainer._wireTables();
    fakeDb = fakeDbContainer.fakeDb as any;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('create transform project from pack creates execution with transform mode', async () => {
    const { packId, materialIds } = await createPackWithMaterials(fakeDb, storage, userId, ['t1', 't2']);
    let capturedInput: any = null;
    let execCounter = 0;
    const mockEngine: any = {
      execute: vi.fn(async (_defId: string, input: any) => {
        capturedInput = input;
        return `00000000-7000-4000-a000-${String(++execCounter).padStart(12, '0')}`;
      }),
      store: { getExecution: vi.fn() },
    };
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: mockEngine, logger: createMockLogger() });
    const { project, execution } = await svc.create({ sourcePackId: packId, mode: 'transform', brief: 'transform brief', userId });

    expect(String((project as any).mode)).toBe('transform');
    expect(String((project as any).sourcePackId ?? (project as any).source_pack_id)).toBe(packId);
    expect((project as any).brief).toBe('transform brief');
    expect(execution).not.toBeNull();
    expect(String((execution as any).id)).toMatch(/00000000-7000/);
    expect(capturedInput.mode).toBe('transform');
    expect(capturedInput.sourcePack.id).toBe(packId);
    expect(capturedInput.provenance.packId).toBe(packId);
    expect(capturedInput.provenance.materialIds).toEqual(expect.arrayContaining(materialIds));
    expect(capturedInput.outputLabels.primary).toBe('creator_thesis');
    expect(mockEngine.execute).toHaveBeenCalledTimes(1);
    // DB persisted
    expect(fakeDbContainer.projectMap.size).toBe(1);
    const stored = Array.from(fakeDbContainer.projectMap.values())[0] as any;
    expect(String(stored.mode)).toBe('transform');
    expect(String(stored.workflowExecutionId ?? stored.workflow_execution_id)).toBe(String((execution as any).id));
  });

  it('create analyze project separates ai_analysis from creator_material', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['a1']);
    let capturedInput: any = null;
    const mockEngine: any = {
      execute: vi.fn(async (_defId: string, input: any) => {
        capturedInput = input;
        return '00000000-7000-4000-a000-000000000002';
      }),
      store: { getExecution: vi.fn() },
    };
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: mockEngine, logger: createMockLogger() });
    const { project, execution } = await svc.create({ sourcePackId: packId, mode: 'analyze', brief: 'analyze my charts', userId });

    expect(String((project as any).mode)).toBe('analyze');
    expect(execution).not.toBeNull();
    expect(capturedInput.mode).toBe('analyze');
    // Spec §10.2 — analyze separates ai_analysis vs creator_material
    expect(capturedInput.outputLabels.primary).toBe('creator_material');
    expect(capturedInput.outputLabels.secondary).toBe('ai_analysis');
    // Provenance preserved
    expect(capturedInput.provenance.packId).toBe(packId);
    expect(Array.isArray(capturedInput.provenance.materialIds)).toBe(true);
  });

  it('create with invalid pack returns 404 SOURCE_PACK_NOT_FOUND', async () => {
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    await expect(svc.create({ sourcePackId: '00000000-0000-4000-a000-000000000999', mode: 'transform', userId })).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
    await expect(svc.create({ sourcePackId: '00000000-0000-4000-a000-000000000998', mode: 'analyze', userId })).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
  });

  it('create enforces pack ownership (other user 404)', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['own1']);
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    await expect(svc.create({ sourcePackId: packId, mode: 'transform', userId: otherUserId })).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
  });

  it('same pack can produce both modes (two projects)', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['both1', 'both2']);
    let callInputs: any[] = [];
    let execCounter = 10;
    const mockEngine: any = {
      execute: vi.fn(async (_defId: string, input: any) => {
        callInputs.push(input);
        return `00000000-7000-4000-a000-${String(++execCounter).padStart(12, '0')}`;
      }),
      store: { getExecution: vi.fn() },
    };
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: mockEngine, logger: createMockLogger() });

    const r1 = await svc.create({ sourcePackId: packId, mode: 'transform', brief: 'first', userId });
    const r2 = await svc.create({ sourcePackId: packId, mode: 'analyze', brief: 'second', userId });

    expect(String((r1.project as any).mode)).toBe('transform');
    expect(String((r2.project as any).mode)).toBe('analyze');
    expect(String((r1.project as any).id)).not.toBe(String((r2.project as any).id));
    expect(String((r1.execution as any).id)).not.toBe(String((r2.execution as any).id));
    expect(fakeDbContainer.projectMap.size).toBe(2);
    expect(callInputs[0].mode).toBe('transform');
    expect(callInputs[1].mode).toBe('analyze');
    // Same provenance packId but different project ids
    expect(callInputs[0].provenance.packId).toBe(packId);
    expect(callInputs[1].provenance.packId).toBe(packId);
  });

  it('create without workflowEngine still persists project (fail-open) with execution null', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['noexec1']);
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    const { project, execution } = await svc.create({ sourcePackId: packId, mode: 'transform', userId });
    expect(String((project as any).mode)).toBe('transform');
    expect(execution).toBeNull();
    const wfId = (project as any).workflowExecutionId ?? (project as any).workflow_execution_id;
    expect(wfId == null).toBe(true);
  });

  it('workflow execute failure is fail-open (project still created, execution null)', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['failopen1']);
    const mockEngine: any = {
      execute: vi.fn(async () => { throw new Error('queue down'); }),
      store: { getExecution: vi.fn() },
    };
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: mockEngine, logger: createMockLogger() });
    const { project, execution } = await svc.create({ sourcePackId: packId, mode: 'transform', userId });
    expect(String((project as any).id)).toBeDefined();
    expect(execution).toBeNull();
  });

  it('getById enforces ownership and returns provenance', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['get1']);
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    const { project } = await svc.create({ sourcePackId: packId, mode: 'transform', userId });
    const pid = String((project as any).id);
    // Other user cannot read
    await expect(svc.getById(pid, otherUserId)).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
    const fetched = await svc.getById(pid, userId);
    expect(String((fetched as any).id)).toBe(pid);
    expect((fetched as any).provenance.packId).toBe(packId);
  });

  it('list respects ownership and pagination', async () => {
    // Create 3 projects for user-1 on two packs
    const { packId: p1 } = await createPackWithMaterials(fakeDb, storage, userId, ['list1']);
    const { packId: p2 } = await createPackWithMaterials(fakeDb, storage, userId, ['list2']);
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    await svc.create({ sourcePackId: p1, mode: 'transform', userId });
    await svc.create({ sourcePackId: p1, mode: 'analyze', userId });
    await svc.create({ sourcePackId: p2, mode: 'transform', userId });
    // Other user's project
    const { packId: pOther } = await createPackWithMaterials(fakeDb, storage, otherUserId, ['other1']);
    const svcOther = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    await svcOther.create({ sourcePackId: pOther, mode: 'transform', userId: otherUserId });

    const page1 = await svc.list({ userId, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows.length).toBe(2);
    const page2 = await svc.list({ userId, page: 2, pageSize: 2 });
    expect(page2.rows.length).toBe(1);
    const otherList = await svcOther.list({ userId: otherUserId, page: 1, pageSize: 20 });
    expect(otherList.total).toBe(1);
  });

  it('validates mode enum via Zod (invalid mode throws VALIDATION_ERROR)', async () => {
    const { packId } = await createPackWithMaterials(fakeDb, storage, userId, ['val1']);
    const svc = new ContentProjectsService({ db: fakeDb, workflowEngine: null, logger: createMockLogger() });
    await expect(svc.create({ sourcePackId: packId, mode: 'invalid' as any, userId })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ── Routes via inject ──────────────────────────────────────────────────────
describe('Content Projects routes (inject)', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeContentProjectsFakeDb>;
  let validToken: string;
  let otherToken: string;
  let lastExecutionInput: any = null;
  let executionInputs: any[] = [];

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-content-routes-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeContentProjectsFakeDb();
    await fakeDbContainer._wireTables();
    const fakeDb = fakeDbContainer.fakeDb as any;

    app = await buildApp({ logger: false as any, db: fakeDb });
    await app.ready();

    const config = (app as any).config as Env;
    const testStorage = new LocalStorageAdapter({ baseDir: tmpDir, secret: String(config.AUTH_SECRET) });
    (app as any).storage = testStorage;

    // Materials / packs wiring for helpers
    const matSvc = new MaterialsService({ db: fakeDb, storage: testStorage, logger: createMockLogger(), config });
    (app as any).materialsService = matSvc;
    (app as any).sourcePacksService = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });

    // Mock workflow engine to return deterministic execution ids and capture input
    let execCounter = 500;
    const mockEngine: any = {
      execute: vi.fn(async (_defId: string, input: any, _ctx: any) => {
        lastExecutionInput = input;
        executionInputs.push(input);
        return `00000000-7000-4000-a000-${String(++execCounter).padStart(12, '0')}`;
      }),
      store: { getExecution: vi.fn(async (id: string) => ({ id, input: lastExecutionInput, status: 'running' })) },
    };
    (app as any).contentProjectsService = new ContentProjectsService({ db: fakeDb, workflowEngine: mockEngine, logger: createMockLogger() });

    validToken = app.jwt.sign({ sub: 'user-1', email: 'user1@example.com' });
    otherToken = app.jwt.sign({ sub: 'user-2', email: 'user2@example.com' });
  });

  afterAll(async () => {
    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  function pngBuf(seed: string): Buffer {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([sig, Buffer.from(`route png ${seed} ${Date.now()} ${Math.random()}`)]);
  }

  function buildMultipartPayload(fields: Record<string, string>, file: { filename: string; mimetype: string; data: Buffer }): { body: Buffer; contentType: string } {
    const boundary = '----TestBoundary' + Math.random().toString(16).slice(2);
    const chunks: Buffer[] = [];
    const push = (s: string) => chunks.push(Buffer.from(s));
    for (const [k, v] of Object.entries(fields)) {
      push(`--${boundary}\r\n`);
      push(`Content-Disposition: form-data; name="${k}"\r\n\r\n`);
      push(`${v}\r\n`);
    }
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`);
    push(`Content-Type: ${file.mimetype}\r\n\r\n`);
    chunks.push(file.data);
    push(`\r\n--${boundary}--\r\n`);
    return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
  }

  async function uploadMaterial(token: string, seed: string): Promise<string> {
    const data = pngBuf(seed);
    const { body, contentType } = buildMultipartPayload({ type: 'chart' }, { filename: `${seed}.png`, mimetype: 'image/png', data });
    const res = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, payload: body });
    if (res.statusCode !== 200) throw new Error(`upload failed ${res.statusCode} ${res.body}`);
    return (res.json() as any).data.material.id as string;
  }

  async function createPack(token: string, seed: string, materialId: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: `Pack ${seed} ${Date.now()}`, materialIds: [materialId] },
    });
    if (res.statusCode !== 201) throw new Error(`create pack failed ${res.statusCode} ${res.body}`);
    return (res.json() as any).data.id as string;
  }

  it('POST /api/content-projects create transform returns 201 with execution mode transform', async () => {
    const m = await uploadMaterial(validToken, 'proj-transform-m');
    const packId = await createPack(validToken, 'proj-transform', m);
    lastExecutionInput = null;
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'transform', brief: 'transform brief' },
    });
    expect(res.statusCode).toBe(201);
    const j = res.json() as any;
    expect(j.success).toBe(true);
    expect(j.data.project.mode).toBe('transform');
    expect(j.data.project.sourcePackId ?? j.data.project.source_pack_id).toBe(packId);
    expect(j.data.execution).not.toBeNull();
    expect(j.data.execution.input.mode).toBe('transform');
    expect(j.data.execution.input.provenance.packId).toBe(packId);
    expect(j.data.execution.input.brief).toBe('transform brief');
  });

  it('POST /api/content-projects create analyze separates ai_analysis from creator_material', async () => {
    const m = await uploadMaterial(validToken, 'proj-analyze-m');
    const packId = await createPack(validToken, 'proj-analyze', m);
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'analyze', brief: 'analyze my charts deeply' },
    });
    expect(res.statusCode).toBe(201);
    const j = res.json() as any;
    expect(j.success).toBe(true);
    expect(j.data.project.mode).toBe('analyze');
    expect(j.data.execution.input.mode).toBe('analyze');
    expect(j.data.execution.input.outputLabels.primary).toBe('creator_material');
    expect(j.data.execution.input.outputLabels.secondary).toBe('ai_analysis');
  });

  it('POST /api/content-projects with invalid pack returns 404 SOURCE_PACK_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: '00000000-0000-4000-a000-000000009999', mode: 'transform' },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('SOURCE_PACK_NOT_FOUND');
  });

  it('same pack can produce both modes (two projects)', async () => {
    const m = await uploadMaterial(validToken, 'proj-both-m');
    const packId = await createPack(validToken, 'proj-both', m);
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'transform', brief: 'first' },
    });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'analyze', brief: 'second' },
    });
    expect(r2.statusCode).toBe(201);
    const j1 = r1.json() as any;
    const j2 = r2.json() as any;
    expect(j1.data.project.id).not.toBe(j2.data.project.id);
    expect(j1.data.project.mode).toBe('transform');
    expect(j2.data.project.mode).toBe('analyze');
    expect(j1.data.execution.id).not.toBe(j2.data.execution.id);
  });

  it('GET /api/content-projects paginated respects ownership', async () => {
    // Create extra project for user-1 to ensure at least 2
    const m = await uploadMaterial(validToken, 'proj-list-m');
    const packId = await createPack(validToken, 'proj-list', m);
    await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'transform' },
    });
    // Other user's project
    const mOther = await uploadMaterial(otherToken, 'proj-list-other-m');
    const packOther = await createPack(otherToken, 'proj-list-other', mOther);
    await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packOther, mode: 'transform' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/content-projects?page=1&pageSize=2', headers: { authorization: `Bearer ${validToken}` } });
    expect(res.statusCode).toBe(200);
    const j = res.json() as any;
    expect(j.success).toBe(true);
    expect(typeof j.data.total).toBe('number');
    expect(Array.isArray(j.data.rows)).toBe(true);
    // All rows must be owned by user-1 (if createdBy present)
    for (const row of j.data.rows as any[]) {
      const owner = String(row.createdBy ?? row.created_by ?? 'user-1');
      expect(owner).toBe('user-1');
    }
  });

  it('GET /api/content-projects/:id enforces ownership', async () => {
    const m = await uploadMaterial(validToken, 'proj-get-m');
    const packId = await createPack(validToken, 'proj-get', m);
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'transform' },
    });
    const projectId = (createRes.json() as any).data.project.id as string;
    const otherGet = await app.inject({ method: 'GET', url: `/api/content-projects/${projectId}`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(otherGet.statusCode).toBe(404);
    const ownGet = await app.inject({ method: 'GET', url: `/api/content-projects/${projectId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(ownGet.statusCode).toBe(200);
    expect((ownGet.json() as any).data.id).toBe(projectId);
  });

  it('routes enforce auth (401 without token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content-projects' });
    expect(res.statusCode).toBe(401);
    const postRes = await app.inject({ method: 'POST', url: '/api/content-projects', headers: { 'content-type': 'application/json' }, payload: { sourcePackId: '00000000-0000-4000-a000-000000000001', mode: 'transform' } });
    expect(postRes.statusCode).toBe(401);
  });

  it('validates mode enum (invalid mode 400)', async () => {
    const m = await uploadMaterial(validToken, 'proj-valid-m');
    const packId = await createPack(validToken, 'proj-valid', m);
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: packId, mode: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('validates sourcePackId is uuid (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-projects',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { sourcePackId: 'not-a-uuid', mode: 'transform' },
    });
    expect(res.statusCode).toBe(400);
  });
});
