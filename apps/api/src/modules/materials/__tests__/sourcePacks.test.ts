import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { MaterialsService } from '../materials.service.js';
import { SourcePacksService } from '../sourcePacks.service.js';
import { LocalStorageAdapter } from '../storage/local.adapter.js';
import type { Env } from '@kantorku/shared';
import { fileAssets, creatorMaterials, sourcePacks, sourcePackItems } from '../../../db/schema.js';

// ── Fake DB (extends materials.test fake with source_packs + sourcePackItems + transaction) ──
function makeSourcePacksFakeDb() {
  const fileAssetMap = new Map<string, Record<string, unknown>>();
  const materialMap = new Map<string, Record<string, unknown>>();
  const packMap = new Map<string, Record<string, unknown>>();
  const packItemMap = new Map<string, Record<string, unknown>>();
  let counter = 9000;
  const nextId = () => `00000000-6000-4000-a000-${String(counter++).padStart(12, '0')}`;

  const tableKey = new WeakMap<object, string>();

  const fakeDb: any = {
    _fileAssets: fileAssetMap,
    _creatorMaterials: materialMap,
    _sourcePacks: packMap,
    _sourcePackItems: packItemMap,
    // also expose legacy alias expected by materials.service/types
    _sourcePacksAlias: packMap,
    _nextId: nextId,
    _tableKey: tableKey,

    transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      // For fake, just pass through same db (mutations are not isolated, but deterministic for tests)
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
                // unique (sourcePackId, materialId)
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
          // Support onConflictDoNothing chaining
          builder.onConflictDoNothing = () => {
            // Wrap returning to swallow unique errors
            const wrappedReturning = async () => {
              try {
                return await returning();
              } catch (err: any) {
                if (err?.code === '23505' || String(err?.message ?? '').includes('unique')) {
                  return [];
                }
                throw err;
              }
            };
            return {
              then: (cb: any) => wrappedReturning().then(cb),
              returning: () => wrappedReturning(),
            };
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
            return [];
          };
          const whereBuilder = (cond: unknown) => {
            let filterValue: string | null = null;
            let filterField: string | null = null;
            if (cond && typeof cond === 'object' && 'queryChunks' in (cond as any)) {
              const chunks = (cond as any).queryChunks as unknown[];
              for (const c of chunks) {
                if (c && typeof c === 'object' && 'name' in (c as any) && typeof (c as any).name === 'string') {
                  filterField = (c as any).name as string;
                  break;
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
              for (const key of variants) {
                if (String((r as any)[key] ?? '') === filterValue) return true;
              }
              if (filterField === 'checksum' && String((r as any).checksum) === filterValue) return true;
              if (filterField === 'id' && String((r as any).id) === filterValue) return true;
              if (filterField === 'fileAssetId' || filterField === 'file_asset_id') {
                if (String((r as any).fileAssetId ?? (r as any).file_asset_id ?? '') === filterValue) return true;
              }
              if (filterField === 'sourcePackId' || filterField === 'source_pack_id') {
                if (String((r as any).sourcePackId ?? (r as any).source_pack_id ?? '') === filterValue) return true;
              }
              if (filterField === 'materialId' || filterField === 'material_id') {
                if (String((r as any).materialId ?? (r as any).material_id ?? '') === filterValue) return true;
              }
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
                else if (tableStr === 'source_pack_items') {
                  // For reorder, update by id
                  if (targetId && packItemMap.has(targetId)) {
                    const row = packItemMap.get(targetId)!;
                    Object.assign(row, patch);
                    return Promise.resolve([row]);
                  }
                  // fallback apply to all (not ideal)
                  return Promise.resolve([]);
                }
                return Promise.resolve(rows);
              };
              // Special handling for source_pack_items where id lookup
              if (tableStr === 'source_pack_items') {
                return {
                  returning: () => {
                    if (targetId && packItemMap.has(targetId)) {
                      const row = packItemMap.get(targetId)!;
                      Object.assign(row, patch);
                      return Promise.resolve([row]);
                    }
                    return Promise.resolve([]);
                  },
                  then(onFulfilled: (v: any) => any) {
                    if (targetId && packItemMap.has(targetId)) {
                      const row = packItemMap.get(targetId)!;
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
              if (c && typeof c === 'object' && 'name' in (c as any) && typeof (c as any).name === 'string') {
                targetField = (c as any).name as string; break;
              }
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
              if (field === 'materialId' || field === 'material_id') {
                for (const [kk, v] of map.entries()) if (String((v as any).materialId ?? (v as any).material_id) === targetId) map.delete(kk);
              } else if (field === 'fileAssetId' || field === 'file_asset_id') {
                for (const [kk, v] of map.entries()) if (String((v as any).fileAssetId ?? (v as any).file_asset_id) === targetId) map.delete(kk);
              } else if (field === 'sourcePackId' || field === 'source_pack_id') {
                for (const [kk, v] of map.entries()) if (String((v as any).sourcePackId ?? (v as any).source_pack_id) === targetId) map.delete(kk);
              } else {
                map.delete(targetId);
              }
            }
          };
          if (tableStr === 'creator_materials') delFrom(materialMap, targetField);
          else if (tableStr === 'file_assets') delFrom(fileAssetMap, targetField);
          else if (tableStr === 'source_packs') delFrom(packMap, targetField);
          else if (tableStr === 'source_pack_items') delFrom(packItemMap, targetField);
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
    tableKey,
    nextId,
    _wireTables: async () => {
      const schema = await import('../../../db/schema.js');
      tableKey.set(schema.fileAssets as unknown as object, 'file_assets');
      tableKey.set(schema.creatorMaterials as unknown as object, 'creator_materials');
      tableKey.set(schema.sourcePacks as unknown as object, 'source_packs');
      tableKey.set(schema.sourcePackItems as unknown as object, 'source_pack_items');
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

// ── Service unit ───────────────────────────────────────────────────────────
describe('SourcePacksService', () => {
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeSourcePacksFakeDb>;
  let fakeDb: any;
  const userId = 'user-1';
  const otherUserId = 'user-2';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-packs-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeSourcePacksFakeDb();
    await fakeDbContainer._wireTables();
    fakeDb = fakeDbContainer.fakeDb as any;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function createMaterialViaService(ownerId: string, seed: string): Promise<string> {
    const svc = new MaterialsService({
      db: fakeDb,
      storage,
      logger: createMockLogger(),
      config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env,
    });
    const buf = pngBuffer(seed);
    const { material } = await svc.upload(buf, { originalName: `${seed}.png`, mimeType: 'image/png', sizeBytes: buf.length, userId: ownerId, type: 'chart' });
    return String(material.id);
  }

  it('create pack with materials returns pack with items', async () => {
    const m1 = await createMaterialViaService(userId, 'm1');
    const m2 = await createMaterialViaService(userId, 'm2');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'My Pack', description: 'desc', materialIds: [m1, m2], userId });
    expect(pack['id']).toBeDefined();
    expect((pack['name'] as string)).toBe('My Pack');
    expect(Array.isArray(pack['items'])).toBe(true);
    expect((pack['items'] as unknown[]).length).toBe(2);
    // items ordered by sortOrder
    const items = pack['items'] as Array<Record<string, unknown>>;
    expect(String((items[0] as any).materialId ?? (items[0] as any).material_id ?? (items[0] as any).material?.id)).toBeDefined();
    // Verify material ids in order
    const matIds = items.map((it) => String((it as any).material?.id ?? (it as any).materialId ?? ''));
    expect(matIds).toEqual([m1, m2]);
    expect(fakeDbContainer.packMap.size).toBe(1);
    expect(fakeDbContainer.packItemMap.size).toBe(2);
  });

  it('create pack without materials returns empty items', async () => {
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'Empty', userId });
    expect(pack['id']).toBeDefined();
    expect((pack['items'] as unknown[]).length).toBe(0);
  });

  it('create pack with material not owned throws MATERIAL_NOT_FOUND', async () => {
    const otherMat = await createMaterialViaService(otherUserId, 'other');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    await expect(svc.create({ name: 'Bad', materialIds: [otherMat], userId })).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
  });

  it('list respects ownership and pagination', async () => {
    const m1 = await createMaterialViaService(userId, 'lm1');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    await svc.create({ name: 'Pack A', materialIds: [m1], userId });
    await svc.create({ name: 'Pack B', userId });
    await svc.create({ name: 'Pack C', userId });
    // Other user's pack
    const otherMat = await createMaterialViaService(otherUserId, 'other2');
    const svcOther = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    await svcOther.create({ name: 'Other Pack', materialIds: [otherMat], userId: otherUserId });

    const page1 = await svc.list({ userId, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows.length).toBe(2);

    const page2 = await svc.list({ userId, page: 2, pageSize: 2 });
    expect(page2.rows.length).toBe(1);

    const otherList = await svcOther.list({ userId: otherUserId, page: 1, pageSize: 20 });
    expect(otherList.total).toBe(1);
    expect(otherList.rows[0]['name']).toBe('Other Pack');
  });

  it('getById enforces ownership (404 for other user)', async () => {
    const m1 = await createMaterialViaService(userId, 'g1');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'Owned', materialIds: [m1], userId });
    const pid = String(pack['id']);
    await expect(svc.getById(pid, otherUserId)).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
    const fetched = await svc.getById(pid, userId);
    expect(String(fetched['id'])).toBe(pid);
  });

  it('update patches name/description', async () => {
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'Old', description: 'old desc', userId });
    const pid = String(pack['id']);
    const updated = await svc.update(pid, userId, { name: 'New Name', description: 'new desc' });
    expect(updated['name']).toBe('New Name');
    expect(updated['description']).toBe('new desc');
  });

  it('addItems idempotent on duplicate materialId (unique constraint, count stays 1)', async () => {
    const m1 = await createMaterialViaService(userId, 'dup1');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'DupPack', materialIds: [m1], userId });
    const pid = String(pack['id']);
    expect((pack['items'] as unknown[]).length).toBe(1);

    // Add same material again — should be idempotent
    const after1 = await svc.addItems(pid, userId, [m1]);
    expect((after1['items'] as unknown[]).length).toBe(1);

    // Add same id twice in one call
    const m2 = await createMaterialViaService(userId, 'dup2');
    const after2 = await svc.addItems(pid, userId, [m2, m2]);
    expect((after2['items'] as unknown[]).length).toBe(2);

    // Add [m1, m2] again — both already present, count stays 2
    const after3 = await svc.addItems(pid, userId, [m1, m2]);
    expect((after3['items'] as unknown[]).length).toBe(2);
  });

  it('addItems verifies material ownership', async () => {
    const mOther = await createMaterialViaService(otherUserId, 'otherAdd');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'P', userId });
    await expect(svc.addItems(String(pack['id']), userId, [mOther])).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
  });

  it('removeItem deletes join row but not material', async () => {
    const m1 = await createMaterialViaService(userId, 'rm1');
    const m2 = await createMaterialViaService(userId, 'rm2');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'RemovePack', materialIds: [m1, m2], userId });
    const pid = String(pack['id']);
    expect((pack['items'] as unknown[]).length).toBe(2);
    await svc.removeItem(pid, userId, m1);
    const after = await svc.getById(pid, userId);
    expect((after['items'] as unknown[]).length).toBe(1);
    const remainingIds = (after['items'] as Array<Record<string, unknown>>).map((it) => String((it as any).material?.id ?? ''));
    expect(remainingIds).toEqual([m2]);
    // Materials still exist
    expect(fakeDbContainer.materialMap.has(m1)).toBe(true);
    expect(fakeDbContainer.materialMap.has(m2)).toBe(true);
  });

  it('reorder updates sortOrder (transaction)', async () => {
    const m1 = await createMaterialViaService(userId, 're1');
    const m2 = await createMaterialViaService(userId, 're2');
    const m3 = await createMaterialViaService(userId, 're3');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'ReorderPack', materialIds: [m1, m2, m3], userId });
    const pid = String(pack['id']);
    // Reverse order: m3 -> 0, m2 -> 1, m1 -> 2
    const reordered = await svc.reorder(pid, userId, [
      { materialId: m3, sortOrder: 0 },
      { materialId: m2, sortOrder: 1 },
      { materialId: m1, sortOrder: 2 },
    ]);
    const items = reordered['items'] as Array<Record<string, unknown>>;
    const matOrder = items.map((it) => String((it as any).material?.id));
    expect(matOrder).toEqual([m3, m2, m1]);
    expect(items[0]['sortOrder'] ?? (items[0] as any).sort_order).toBe(0);
    expect(items[1]['sortOrder'] ?? (items[1] as any).sort_order).toBe(1);
    expect(items[2]['sortOrder'] ?? (items[2] as any).sort_order).toBe(2);
  });

  it('reorder rejects material not in pack', async () => {
    const m1 = await createMaterialViaService(userId, 'rre1');
    const m2 = await createMaterialViaService(userId, 'rre2');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'Rej', materialIds: [m1], userId });
    await expect(svc.reorder(String(pack['id']), userId, [{ materialId: m2, sortOrder: 0 }])).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
  });

  it('delete pack cascades items but not materials', async () => {
    const m1 = await createMaterialViaService(userId, 'del1');
    const m2 = await createMaterialViaService(userId, 'del2');
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'ToDelete', materialIds: [m1, m2], userId });
    const pid = String(pack['id']);
    expect(fakeDbContainer.packMap.size).toBe(1);
    expect(fakeDbContainer.packItemMap.size).toBe(2);
    await svc.delete(pid, userId);
    expect(fakeDbContainer.packMap.size).toBe(0);
    expect(fakeDbContainer.packItemMap.size).toBe(0);
    // Materials remain
    expect(fakeDbContainer.materialMap.has(m1)).toBe(true);
    expect(fakeDbContainer.materialMap.has(m2)).toBe(true);
    expect(fakeDbContainer.fileAssetMap.size).toBe(2);
    // getById now 404
    await expect(svc.getById(pid, userId)).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
  });

  it('delete enforces ownership', async () => {
    const svc = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });
    const pack = await svc.create({ name: 'OwnDel', userId });
    await expect(svc.delete(String(pack['id']), otherUserId)).rejects.toMatchObject({ code: 'SOURCE_PACK_NOT_FOUND' });
  });
});

// ── Routes via inject ──────────────────────────────────────────────────────
describe('SourcePacks routes (inject)', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeSourcePacksFakeDb>;
  let validToken: string;
  let otherToken: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-packs-routes-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeSourcePacksFakeDb();
    await fakeDbContainer._wireTables();
    const fakeDb = fakeDbContainer.fakeDb as any;

    app = await buildApp({ logger: false as any, db: fakeDb });

    const config = (app as any).config as Env;
    const testStorage = new LocalStorageAdapter({ baseDir: tmpDir, secret: String(config.AUTH_SECRET) });
    (app as any).storage = testStorage;
    // MaterialsService for creating materials via upload route
    const matSvc = new MaterialsService({ db: fakeDb, storage: testStorage, logger: createMockLogger(), config });
    (app as any).materialsService = matSvc;
    // SourcePacksService — ensure app has it (buildApp may have created its own with same fakeDb, but override to be explicit)
    (app as any).sourcePacksService = new SourcePacksService({ db: fakeDb, logger: createMockLogger() });

    await app.ready();
    validToken = app.jwt.sign({ sub: 'user-1', email: 'user1@example.com' });
    otherToken = app.jwt.sign({ sub: 'user-2', email: 'user2@example.com' });
  });

  afterAll(async () => {
    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

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

  function pngBuf(seed: string): Buffer {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([sig, Buffer.from(`route png ${seed} ${Date.now()} ${Math.random()}`)]);
  }

  async function uploadMaterial(token: string, seed: string): Promise<string> {
    const data = pngBuf(seed);
    const { body, contentType } = buildMultipartPayload({ type: 'chart' }, { filename: `${seed}.png`, mimetype: 'image/png', data });
    const res = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, payload: body });
    if (res.statusCode !== 200) throw new Error(`upload failed ${res.statusCode} ${res.body}`);
    return (res.json() as any).data.material.id as string;
  }

  it('POST /api/source-packs create with materials returns 201 with items', async () => {
    const m1 = await uploadMaterial(validToken, 'pack-route-m1');
    const m2 = await uploadMaterial(validToken, 'pack-route-m2');
    const res = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: 'Route Pack', description: 'via route', materialIds: [m1, m2] },
    });
    expect(res.statusCode).toBe(201);
    const j = res.json() as any;
    expect(j.success).toBe(true);
    expect(j.data.id).toBeDefined();
    expect(j.data.name).toBe('Route Pack');
    expect(Array.isArray(j.data.items)).toBe(true);
    expect(j.data.items.length).toBe(2);
  });

  it('GET /api/source-packs list respects ownership and pagination', async () => {
    // Create an extra pack for user-1
    const m = await uploadMaterial(validToken, 'list-pack-m');
    await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `List Pack ${Date.now()}`, materialIds: [m] },
    });
    // Other user's pack
    const mOther = await uploadMaterial(otherToken, 'list-other-m');
    await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' },
      payload: { name: 'Other List Pack', materialIds: [mOther] },
    });

    const res = await app.inject({ method: 'GET', url: '/api/source-packs?page=1&pageSize=2', headers: { authorization: `Bearer ${validToken}` } });
    expect(res.statusCode).toBe(200);
    const j = res.json() as any;
    expect(j.success).toBe(true);
    expect(typeof j.data.total).toBe('number');
    expect(j.data.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(j.data.rows)).toBe(true);
    // None of the rows should be other user's pack
    for (const row of j.data.rows as Array<Record<string, unknown>>) {
      expect(String(row['createdBy'] ?? (row as any).created_by ?? row['createdBy'])).not.toBe('user-2');
    }

    const otherRes = await app.inject({ method: 'GET', url: '/api/source-packs?page=1&pageSize=20', headers: { authorization: `Bearer ${otherToken}` } });
    expect(otherRes.statusCode).toBe(200);
    const oj = otherRes.json() as any;
    expect(oj.data.rows.every((r: any) => String(r.createdBy ?? r.created_by) === 'user-2' || r.name === 'Other List Pack')).toBe(true);
  });

  it('POST /api/source-packs/:id/items idempotent on duplicate materialId', async () => {
    const m1 = await uploadMaterial(validToken, 'idem-m1');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `Idem Pack ${Date.now()}`, materialIds: [m1] },
    });
    const packId = (createRes.json() as any).data.id as string;
    const beforeCount = ((createRes.json() as any).data.items as unknown[]).length;
    expect(beforeCount).toBe(1);

    // Add same id twice — should stay 1
    const addRes1 = await app.inject({
      method: 'POST',
      url: `/api/source-packs/${packId}/items`,
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { materialIds: [m1, m1] },
    });
    expect(addRes1.statusCode).toBe(200);
    expect(((addRes1.json() as any).data.items as unknown[]).length).toBe(1);

    // Add same again
    const addRes2 = await app.inject({
      method: 'POST',
      url: `/api/source-packs/${packId}/items`,
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { materialIds: [m1] },
    });
    expect(addRes2.statusCode).toBe(200);
    expect(((addRes2.json() as any).data.items as unknown[]).length).toBe(1);
  });

  it('PATCH /api/source-packs/:id/items/reorder updates sortOrder', async () => {
    const m1 = await uploadMaterial(validToken, 'reorder-r1');
    const m2 = await uploadMaterial(validToken, 'reorder-r2');
    const m3 = await uploadMaterial(validToken, 'reorder-r3');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `Reorder Pack ${Date.now()}`, materialIds: [m1, m2, m3] },
    });
    const packId = (createRes.json() as any).data.id as string;

    const reorderRes = await app.inject({
      method: 'PATCH',
      url: `/api/source-packs/${packId}/items/reorder`,
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { order: [{ materialId: m3, sortOrder: 0 }, { materialId: m2, sortOrder: 1 }, { materialId: m1, sortOrder: 2 }] },
    });
    expect(reorderRes.statusCode).toBe(200);
    const j = reorderRes.json() as any;
    expect(j.success).toBe(true);
    const items = j.data.items as Array<Record<string, unknown>>;
    const matIds = items.map((it) => String((it as any).material?.id ?? (it as any).materialId ?? ''));
    expect(matIds).toEqual([m3, m2, m1]);
  });

  it('DELETE /api/source-packs/:id cascades items but not materials', async () => {
    const m1 = await uploadMaterial(validToken, 'delpack-m1');
    const m2 = await uploadMaterial(validToken, 'delpack-m2');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `Del Pack ${Date.now()}`, materialIds: [m1, m2] },
    });
    const packId = (createRes.json() as any).data.id as string;

    const delRes = await app.inject({ method: 'DELETE', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(delRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(getRes.statusCode).toBe(404);
    expect((getRes.json() as any).error.code).toBe('SOURCE_PACK_NOT_FOUND');

    // Materials still fetchable
    const getMat1 = await app.inject({ method: 'GET', url: `/api/materials/${m1}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(getMat1.statusCode).toBe(200);
    const getMat2 = await app.inject({ method: 'GET', url: `/api/materials/${m2}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(getMat2.statusCode).toBe(200);
  });

  it('DELETE /api/source-packs/:id/items/:materialId removes item', async () => {
    const m1 = await uploadMaterial(validToken, 'ritem-m1');
    const m2 = await uploadMaterial(validToken, 'ritem-m2');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `RemoveItem Pack ${Date.now()}`, materialIds: [m1, m2] },
    });
    const packId = (createRes.json() as any).data.id as string;
    const rmRes = await app.inject({ method: 'DELETE', url: `/api/source-packs/${packId}/items/${m1}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(rmRes.statusCode).toBe(200);
    const getRes = await app.inject({ method: 'GET', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${validToken}` } });
    const items = (getRes.json() as any).data.items as unknown[];
    expect(items.length).toBe(1);
  });

  it('routes enforce auth (401 without token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/source-packs' });
    expect(res.statusCode).toBe(401);
  });

  it('ownership enforced: other user cannot read/update/delete pack', async () => {
    const m = await uploadMaterial(validToken, 'own-enforce-m');
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/source-packs',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      payload: { name: `OwnEnforce ${Date.now()}`, materialIds: [m] },
    });
    const packId = (createRes.json() as any).data.id as string;

    const getOther = await app.inject({ method: 'GET', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(getOther.statusCode).toBe(404);

    const patchOther = await app.inject({ method: 'PATCH', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' }, payload: { name: 'hijack' } });
    expect(patchOther.statusCode).toBe(404);

    const delOther = await app.inject({ method: 'DELETE', url: `/api/source-packs/${packId}`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(delOther.statusCode).toBe(404);
  });
});
