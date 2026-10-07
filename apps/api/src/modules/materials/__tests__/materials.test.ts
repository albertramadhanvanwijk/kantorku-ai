import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { MaterialsService } from '../materials.service.js';
import { LocalStorageAdapter } from '../storage/local.adapter.js';
import type { Env } from '@kantorku/shared';
import { fileAssets, creatorMaterials } from '../../../db/schema.js';

// ── In-memory fake DB for materials ────────────────────────────────────────
// We extend the pattern from routes.test but add material tables. Simplest is
// a minimal drizzle-like shim that supports insert/select/update/delete for
// file_assets + creator_materials + source_pack_items.

function makeMaterialsFakeDb() {
  const fileAssetMap = new Map<string, Record<string, unknown>>();
  const materialMap = new Map<string, Record<string, unknown>>();
  const packItemMap = new Map<string, Record<string, unknown>>();
  let counter = 7000;
  const nextId = () => `00000000-4000-4000-a000-${String(counter++).padStart(12, '0')}`;

  const getTableName = (table: unknown): string => {
    try {
      const s = String((table as any)?.[Symbol.for('drizzle:Name')] ?? '');
      if (s) return s;
    } catch {}
    // Try identity by checking known tables via import (lazy)
    return 'unknown';
  };

  // Use WeakMap populated after importing schema tables
  const tableKey = new WeakMap<object, string>();

  const fakeDb: any = {
    _fileAssets: fileAssetMap,
    _creatorMaterials: materialMap,
    _sourcePackItems: packItemMap,
    _nextId: nextId,
    _tableKey: tableKey,

    insert(table: unknown) {
      return {
        values(vals: Record<string, unknown> | Record<string, unknown>[]) {
          const arr = Array.isArray(vals) ? vals : [vals];
          const tableStr = (() => {
            const k = tableKey.get(table as object);
            if (k) return k;
            try {
              const name = String(table);
              if (name.includes('file_assets') || name.includes('fileAssets')) return 'file_assets';
              if (name.includes('creator_materials') || name.includes('creatorMaterials')) return 'creator_materials';
              if (name.includes('source_pack_items') || name.includes('sourcePackItems')) return 'source_pack_items';
            } catch {}
            return 'unknown';
          })();

          const returning = (proj?: Record<string, unknown>) => {
            const out: Record<string, unknown>[] = [];
            for (const v of arr) {
              if (tableStr === 'file_assets') {
                const id = (v as any).id ?? nextId();
                // unique checksum check
                const checksum = String((v as any).checksum ?? '');
                for (const existing of fileAssetMap.values()) {
                  if (String((existing as any).checksum) === checksum) {
                    const err: any = new Error(`duplicate key value violates unique constraint "file_assets_checksum_unique"`);
                    err.code = '23505';
                    throw err;
                  }
                }
                const row: Record<string, unknown> = { id, createdAt: new Date(), ...v };
                // normalize keys for query compatibility
                (row as any).uploadedBy = (v as any).uploadedBy ?? (v as any).uploaded_by;
                (row as any).storageDriver = (v as any).storageDriver ?? (v as any).storage_driver;
                fileAssetMap.set(String(id), row);
                if (proj) {
                  const key = Object.keys(proj)[0] ?? 'id';
                  out.push({ [key]: id });
                  // but for full returning we push full row
                  if (Object.keys(proj).length > 1 || key !== 'id') out[out.length - 1] = row;
                  else out[out.length - 1] = row;
                } else out.push(row);
              } else if (tableStr === 'creator_materials') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), updatedAt: new Date(), ...v };
                (row as any).fileAssetId = (v as any).fileAssetId ?? (v as any).file_asset_id;
                materialMap.set(String(id), row);
                out.push(row);
              } else if (tableStr === 'source_pack_items') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), ...v };
                packItemMap.set(String(id), row);
                out.push(row);
              } else {
                const id = nextId();
                out.push({ id, ...v });
              }
            }
            return Promise.resolve(out);
          };

          return {
            returning: (proj?: Record<string, unknown>) => returning(proj),
            then(onFulfilled: (v: any) => any) {
              return returning().then(onFulfilled);
            },
          };
        },
      };
    },

    select(proj?: unknown) {
      return {
        from(table: unknown) {
          const tableStr = (() => {
            const k = tableKey.get(table as object);
            if (k) return k;
            try {
              const name = String(table);
              if (name.includes('file_assets') || name.includes('fileAssets')) return 'file_assets';
              if (name.includes('creator_materials') || name.includes('creatorMaterials')) return 'creator_materials';
              if (name.includes('source_pack_items') || name.includes('sourcePackItems')) return 'source_pack_items';
              if (name.includes('workflow_definitions')) return 'workflow_definitions';
              if (name.includes('users')) return 'users';
            } catch {}
            return 'unknown';
          })();

          const allRows = (): Record<string, unknown>[] => {
            if (tableStr === 'file_assets') return Array.from(fileAssetMap.values());
            if (tableStr === 'creator_materials') return Array.from(materialMap.values());
            if (tableStr === 'source_pack_items') return Array.from(packItemMap.values());
            return [];
          };

          const whereBuilder = (cond: unknown) => {
            // Try to extract filter from Drizzle eq() — look for Param chunk
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
                // fallback: if filterValue looks like uuid, assume id or checksum
                if (/^[0-9a-f]{8}-/.test(filterValue)) filterField = 'id';
                else filterField = 'checksum';
              }
            }

            const rows = allRows().filter((r) => {
              if (!filterValue || !filterField) return true;
              // Try multiple key variants
              const variants = [filterField, filterField.replace(/([A-Z])/g, '_$1').toLowerCase(), filterField.toLowerCase()];
              for (const k of variants) {
                if (String((r as any)[k] ?? '') === filterValue) return true;
              }
              // Also try checksum specifically
              if (filterField === 'checksum' && String((r as any).checksum) === filterValue) return true;
              if (filterField === 'id' && String((r as any).id) === filterValue) return true;
              // fileAssetId
              if (filterField === 'fileAssetId' || filterField === 'file_asset_id') {
                if (String((r as any).fileAssetId ?? (r as any).file_asset_id ?? '') === filterValue) return true;
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
              offset(o: number) {
                return Promise.resolve(rows.slice(o));
              },
            };
            const promise: any = Promise.resolve(rows);
            // Attach limit/offset for drizzle chaining .where(...).limit(1)
            promise.limit = builder.limit;
            promise.offset = builder.offset;
            return Object.assign(promise, builder);
          };

          // select().from().where() or select().from().limit()
          const base: any = {
            where: whereBuilder,
            limit(n: number) {
              const rows = allRows();
              const sliced = rows.slice(0, n);
              const p: any = Promise.resolve(sliced);
              p.offset = (o: number) => Promise.resolve(rows.slice(o, o + n));
              return p;
            },
            offset(o: number) {
              return Promise.resolve(allRows().slice(o));
            },
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
              // Naive: find by id param and apply patch
              let targetId: string | null = null;
              if (_cond && typeof _cond === 'object' && 'queryChunks' in (_cond as any)) {
                for (const c of (_cond as any).queryChunks as unknown[]) {
                  if (c && typeof c === 'object' && (c as any).constructor?.name === 'Param') {
                    const v = (c as any).value;
                    if (typeof v === 'string' && /^[0-9a-f]{8}-/.test(v)) { targetId = v; break; }
                  }
                }
              }
              const tableStr = (() => {
                const k = tableKey.get(table as object);
                if (k) return k;
                return 'unknown';
              })();
              const apply = (map: Map<string, Record<string, unknown>>) => {
                if (targetId && map.has(targetId)) {
                  const row = map.get(targetId)!;
                  Object.assign(row, patch);
                  return [row];
                }
                // fallback: apply to all
                for (const row of map.values()) Object.assign(row, patch);
                return Array.from(map.values()).slice(0, 1);
              };
              const returning = (proj?: Record<string, unknown>) => {
                let rows: Record<string, unknown>[] = [];
                if (tableStr === 'creator_materials') rows = apply(materialMap);
                else if (tableStr === 'file_assets') rows = apply(fileAssetMap);
                else rows = [];
                return Promise.resolve(rows);
              };
              return {
                returning: (proj?: Record<string, unknown>) => returning(proj),
                then(onFulfilled: (v: any) => any) { return returning().then(onFulfilled); },
              };
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
                targetField = (c as any).name as string;
                break;
              }
            }
            for (const c of (_cond as any).queryChunks as unknown[]) {
              if (c && typeof c === 'object' && (c as any).constructor?.name === 'Param') {
                const v = (c as any).value;
                if (typeof v === 'string') { targetId = v; break; }
              }
            }
          }
          const tableStr = (() => {
            const k = tableKey.get(table as object);
            if (k) return k;
            return 'unknown';
          })();
          const delFrom = (map: Map<string, Record<string, unknown>>, field?: string | null) => {
            if (targetId) {
              if (field === 'materialId' || field === 'material_id') {
                for (const [k, v] of map.entries()) {
                  if (String((v as any).materialId ?? (v as any).material_id) === targetId) map.delete(k);
                }
              } else if (field === 'fileAssetId' || field === 'file_asset_id') {
                for (const [k, v] of map.entries()) {
                  if (String((v as any).fileAssetId ?? (v as any).file_asset_id) === targetId) map.delete(k);
                }
              } else {
                map.delete(targetId);
              }
            }
          };
          if (tableStr === 'creator_materials') delFrom(materialMap, targetField);
          else if (tableStr === 'file_assets') delFrom(fileAssetMap, targetField);
          else if (tableStr === 'source_pack_items') delFrom(packItemMap, targetField);
          return Promise.resolve([]);
        },
      };
    },
  };

  // Populate table identity map
  return { fakeDb, fileAssetMap, materialMap, packItemMap, tableKey, nextId, _wireTables: async () => {
    const schema = await import('../../../db/schema.js');
    tableKey.set(schema.fileAssets as unknown as object, 'file_assets');
    tableKey.set(schema.creatorMaterials as unknown as object, 'creator_materials');
    tableKey.set(schema.sourcePackItems as unknown as object, 'source_pack_items');
    // Also need workflow tables for ExecutionStore seeding inside buildApp — provide stubs
    tableKey.set(schema.workflowDefinitions as unknown as object, 'workflow_definitions');
    tableKey.set(schema.workflowExecutions as unknown as object, 'workflow_executions');
    tableKey.set(schema.workflowSteps as unknown as object, 'workflow_steps');
    tableKey.set(schema.approvals as unknown as object, 'approvals');
    tableKey.set(schema.agentRuns as unknown as object, 'agent_runs');
    tableKey.set(schema.users as unknown as object, 'users');
  } };
}

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'silent' } as unknown as any;
}

function pngBuffer(): Buffer {
  // Minimal valid PNG: 8-byte signature + IHDR chunk stub (enough for magic check)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const filler = Buffer.from('fake png content for test dedup and upload');
  return Buffer.concat([sig, filler]);
}

function jpgBuffer(): Buffer {
  const sig = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([sig, Buffer.from('fake jpg')]);
}

function pdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4 fake pdf content');
}

function exeBuffer(): Buffer {
  return Buffer.from('MZ fake exe');
}

// ── Helpers for multipart inject ───────────────────────────────────────────
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

  // Verify the payload round-trips through our builder (debug aid)
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function hasMultipartSupport(app: any): boolean {
  return typeof app?.hasContentTypeParser === 'function' ? app.hasContentTypeParser('multipart/form-data') : false;
}

// ── Suite: Service unit ────────────────────────────────────────────────────
describe('MaterialsService', () => {
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeMaterialsFakeDb>;
  let svc: MaterialsService;
  const userId = 'user-1';
  const otherUserId = 'user-2';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-mat-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeMaterialsFakeDb();
    await fakeDbContainer._wireTables();
    const fakeDb = fakeDbContainer.fakeDb as any;
    const config = {
      STORAGE_DRIVER: 'local' as const,
      STORAGE_BUCKET: '',
      STORAGE_LOCAL_DIR: tmpDir,
      MAX_UPLOAD_MB: 25,
      AUTH_SECRET: 'test-secret-min-32-chars!!',
    } as unknown as Env;
    svc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('upload valid png creates file_asset + material', async () => {
    const buf = pngBuffer();
    const res = await svc.upload(buf, { originalName: 'chart.png', mimeType: 'image/png', sizeBytes: buf.length, userId, title: 'My Chart', type: 'chart' });
    expect(res.material).toBeDefined();
    expect(res.material.id).toBeDefined();
    expect(res.material.type).toBe('chart');
    expect(res.fileAsset).toBeDefined();
    expect(res.fileAsset.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(res.fileAsset.checksum).toBe(createHash('sha256').update(buf).digest('hex'));
    expect(fakeDbContainer.fileAssetMap.size).toBe(1);
    expect(fakeDbContainer.materialMap.size).toBe(1);
  });

  it('upload oversized returns 413 FILE_TOO_LARGE', async () => {
    // Use a service with MAX_UPLOAD_MB=1 and a 2MB png (with valid header)
    const fakeDb2 = makeMaterialsFakeDb();
    await fakeDb2._wireTables();
    const storage2 = new LocalStorageAdapter({ baseDir: tmpDir, secret: 's' });
    const config = { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 1, AUTH_SECRET: 's' } as unknown as Env;
    const svc2 = new MaterialsService({ db: fakeDb2.fakeDb as any, storage: storage2, logger: createMockLogger(), config });
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2 * 1024 * 1024, 0x61)]);
    await expect(svc2.upload(big, { originalName: 'big.png', mimeType: 'image/png', sizeBytes: big.length, userId })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', statusCode: 413 });
  });

  it('upload disallowed extension returns 415 INVALID_FILE_TYPE', async () => {
    const buf = exeBuffer();
    await expect(svc.upload(buf, { originalName: 'malware.exe', mimeType: 'image/png', sizeBytes: buf.length, userId })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE', statusCode: 415 });
  });

  it('upload disallowed MIME returns 415', async () => {
    const buf = exeBuffer();
    await expect(svc.upload(buf, { originalName: 'file.png', mimeType: 'application/x-msdownload', sizeBytes: buf.length, userId })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('upload with magic bytes mismatch (png ext but jpg bytes) returns 415', async () => {
    const buf = jpgBuffer(); // jpg magic but .png ext
    await expect(svc.upload(buf, { originalName: 'fake.png', mimeType: 'image/png', sizeBytes: buf.length, userId })).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('upload duplicate checksum reuses file_asset but creates new material (dedup)', async () => {
    const buf = pngBuffer();
    const r1 = await svc.upload(buf, { originalName: 'a.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'chart' });
    const r2 = await svc.upload(buf, { originalName: 'b.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'logo' });
    expect(fakeDbContainer.fileAssetMap.size).toBe(1);
    expect(fakeDbContainer.materialMap.size).toBe(2);
    expect(r1.fileAsset.id).toBe(r2.fileAsset.id);
    expect(r1.fileAsset.checksum).toBe(r2.fileAsset.checksum);
    expect(r1.material.id).not.toBe(r2.material.id);
  });

  it('list/get/patch/delete enforce ownership (other user 404)', async () => {
    const buf = pngBuffer();
    const { material } = await svc.upload(buf, { originalName: 'own.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'chart' });
    // list as other user returns 0
    const listOther = await svc.list({ userId: otherUserId, page: 1, pageSize: 20 });
    expect(listOther.total).toBe(0);
    // get as other user throws
    await expect(svc.getById(material.id, otherUserId)).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
    // patch as other user throws
    await expect(svc.update(material.id, otherUserId, { title: 'hijack' })).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
    // delete as other user throws
    await expect(svc.delete(material.id, otherUserId)).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
    // owner can still get/patch/delete
    const got = await svc.getById(material.id, userId);
    expect(got.id).toBe(material.id);
    const patched = await svc.update(material.id, userId, { title: 'Renamed' });
    expect(patched.title).toBe('Renamed');
    await svc.delete(material.id, userId);
    expect(fakeDbContainer.materialMap.size).toBe(0);
  });

  it('delete removes file_asset when no other material references it', async () => {
    const buf = pngBuffer();
    const { material } = await svc.upload(buf, { originalName: 'del.png', mimeType: 'image/png', sizeBytes: buf.length, userId });
    expect(fakeDbContainer.fileAssetMap.size).toBe(1);
    await svc.delete(material.id, userId);
    expect(fakeDbContainer.fileAssetMap.size).toBe(0);
  });

  it('delete keeps file_asset when another material still references it (dedup)', async () => {
    const buf = pngBuffer();
    const r1 = await svc.upload(buf, { originalName: 'a.png', mimeType: 'image/png', sizeBytes: buf.length, userId });
    const r2 = await svc.upload(buf, { originalName: 'b.png', mimeType: 'image/png', sizeBytes: buf.length, userId });
    expect(fakeDbContainer.fileAssetMap.size).toBe(1);
    await svc.delete(r1.material.id, userId);
    expect(fakeDbContainer.fileAssetMap.size).toBe(1);
    expect(fakeDbContainer.materialMap.size).toBe(1);
    await svc.delete(r2.material.id, userId);
    expect(fakeDbContainer.fileAssetMap.size).toBe(0);
  });
});

// ── Suite: Routes via inject (multipart) ───────────────────────────────────
describe('Materials routes (inject)', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeMaterialsFakeDb>;
  let validToken: string;
  let otherToken: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-mat-routes-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeMaterialsFakeDb();
    await fakeDbContainer._wireTables();

    const fakeDb = fakeDbContainer.fakeDb as any;
    // Add minimal workflow tables stub so ExecutionStore seeding inside buildApp doesn't crash
    // Our fake select returns empty for workflow tables which is fine; buildApp isTestMode skips seeding

    app = await buildApp({ logger: false as any, db: fakeDb });

    // buildApp now auto-registers materialsRoutes + creates storage/materialsService.
    // Override storage to use the tmpDir for this test (isolation), but keep existing routes.
    const config = (app as any).config as Env;
    const testStorage = new LocalStorageAdapter({ baseDir: tmpDir, secret: String(config.AUTH_SECRET) });
    (app as any).storage = testStorage;
    (app as any).materialsService = new MaterialsService({ db: fakeDb, storage: testStorage, logger: createMockLogger(), config });

    await app.ready();
    validToken = app.jwt.sign({ sub: 'user-1', email: 'user1@example.com' });
    otherToken = app.jwt.sign({ sub: 'user-2', email: 'user2@example.com' });
  });

  afterAll(async () => {
    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Helper to inject multipart upload
  function injectUpload(token: string, fields: Record<string, string> = {}, fileOpts?: { filename?: string; mimetype?: string; data?: Buffer }) {
    const data = fileOpts?.data ?? pngBuffer();
    const filename = fileOpts?.filename ?? 'chart.png';
    const mimetype = fileOpts?.mimetype ?? 'image/png';
    const { body, contentType } = buildMultipartPayload(fields, { filename, mimetype, data });
    return app.inject({
      method: 'POST',
      url: '/api/materials/upload',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: body,
    });
  }

  it('upload valid png 200 with material + fileAsset url', async () => {
    const res = await injectUpload(validToken, { title: 'My Chart', type: 'chart' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.material).toBeDefined();
    expect(body.data.material.id).toBeDefined();
    expect(body.data.material.type).toBe('chart');
    expect(body.data.fileAsset).toBeDefined();
    expect(body.data.fileAsset.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data.fileAsset.url).toContain('/api/files/');
    expect(body.data.fileAsset.url).toContain('expires=');
    expect(body.data.fileAsset.url).toContain('sig=');
  });

  it('upload oversized returns 413 FILE_TOO_LARGE', async () => {
    // Temporarily lower limit via app.config mock
    const orig = (app as any).config.MAX_UPLOAD_MB;
    (app as any).config.MAX_UPLOAD_MB = 0.00001; // ~10 bytes
    // Re-create service with new limit
    const svc = (app as any).materialsService as MaterialsService;
    (svc as any).config.MAX_UPLOAD_MB = 0.00001;
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1024, 0x61)]);
    const { body, contentType } = buildMultipartPayload({}, { filename: 'big.png', mimetype: 'image/png', data: big });
    const res = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${validToken}`, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(413);
    const json = res.json() as any;
    expect(json.error.code).toBe('FILE_TOO_LARGE');
    // restore
    (app as any).config.MAX_UPLOAD_MB = orig;
    (svc as any).config.MAX_UPLOAD_MB = orig;
  });

  it('upload disallowed extension returns 415 INVALID_FILE_TYPE', async () => {
    const res = await injectUpload(validToken, {}, { filename: 'evil.exe', mimetype: 'image/png', data: pngBuffer() });
    expect(res.statusCode).toBe(415);
    const json = res.json() as any;
    expect(json.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('upload duplicate checksum reuses file_asset but creates new material (dedup)', async () => {
    const buf = pngBuffer();
    // Use unique buf for this test to avoid collision with prior pngBuffer() (same bytes)
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const unique = Buffer.concat([sig, Buffer.from('dedup-route-test-unique-' + Date.now())]);
    const beforeAssets = fakeDbContainer.fileAssetMap.size;
    const beforeMats = fakeDbContainer.materialMap.size;

    const { body: b1, contentType: ct1 } = buildMultipartPayload({ type: 'chart' }, { filename: 'dup1.png', mimetype: 'image/png', data: unique });
    const r1 = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${validToken}`, 'content-type': ct1 }, payload: b1 });
    expect(r1.statusCode).toBe(200);
    const j1 = r1.json() as any;

    const { body: b2, contentType: ct2 } = buildMultipartPayload({ type: 'logo' }, { filename: 'dup2.png', mimetype: 'image/png', data: unique });
    const r2 = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${validToken}`, 'content-type': ct2 }, payload: b2 });
    expect(r2.statusCode).toBe(200);
    const j2 = r2.json() as any;

    // file_assets +1 total, materials +2
    expect(fakeDbContainer.fileAssetMap.size).toBe(beforeAssets + 1);
    expect(fakeDbContainer.materialMap.size).toBe(beforeMats + 2);
    expect(j1.data.fileAsset.checksum).toBe(j2.data.fileAsset.checksum);
    expect(j1.data.fileAsset.id).toBe(j2.data.fileAsset.id);
    expect(j1.data.material.id).not.toBe(j2.data.material.id);
  });

  it('list/get/patch/delete enforce ownership (other user 404)', async () => {
    // Upload as user-1
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const unique = Buffer.concat([sig, Buffer.from('ownership-test-' + Date.now() + Math.random())]);
    const { body, contentType } = buildMultipartPayload({ type: 'document' }, { filename: 'own.png', mimetype: 'image/png', data: unique });
    const up = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${validToken}`, 'content-type': contentType }, payload: body });
    expect(up.statusCode).toBe(200);
    const matId = (up.json() as any).data.material.id as string;

    // GET as other user -> 404
    const getOther = await app.inject({ method: 'GET', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(getOther.statusCode).toBe(404);
    expect((getOther.json() as any).error.code).toBe('MATERIAL_NOT_FOUND');

    // PATCH as other user -> 404
    const patchOther = await app.inject({ method: 'PATCH', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' }, payload: { title: 'hijack' } });
    expect(patchOther.statusCode).toBe(404);

    // DELETE as other user -> 404
    const delOther = await app.inject({ method: 'DELETE', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(delOther.statusCode).toBe(404);

    // Owner can GET/PATCH/DELETE
    const getOwn = await app.inject({ method: 'GET', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(getOwn.statusCode).toBe(200);

    const patchOwn = await app.inject({ method: 'PATCH', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' }, payload: { title: 'Renamed via API' } });
    expect(patchOwn.statusCode).toBe(200);
    expect((patchOwn.json() as any).data.title).toBe('Renamed via API');

    const delOwn = await app.inject({ method: 'DELETE', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(delOwn.statusCode).toBe(200);

    const getAfter = await app.inject({ method: 'GET', url: `/api/materials/${matId}`, headers: { authorization: `Bearer ${validToken}` } });
    expect(getAfter.statusCode).toBe(404);
  });

  it('GET /api/materials paginated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/materials?page=1&pageSize=5', headers: { authorization: `Bearer ${validToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.rows)).toBe(true);
    expect(typeof body.data.total).toBe('number');
  });

  it('upload without auth returns 401', async () => {
    const { body, contentType } = buildMultipartPayload({}, { filename: 'a.png', mimetype: 'image/png', data: pngBuffer() });
    const res = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(401);
  });
});
