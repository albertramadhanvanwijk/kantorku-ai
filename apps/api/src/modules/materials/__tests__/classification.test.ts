import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { MaterialsService } from '../materials.service.js';
import { ClassificationService } from '../classification.service.js';
import { LocalStorageAdapter } from '../storage/local.adapter.js';
import type { Env } from '@kantorku/shared';
import { fileAssets, creatorMaterials } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { AgentService } from '../../agents/agent.service.js';

// ── Reuse fake DB from materials.test.ts (trimmed copy) ─────────────────────
function makeMaterialsFakeDb() {
  const fileAssetMap = new Map<string, Record<string, unknown>>();
  const materialMap = new Map<string, Record<string, unknown>>();
  const packItemMap = new Map<string, Record<string, unknown>>();
  let counter = 8000;
  const nextId = () => `00000000-5000-4000-a000-${String(counter++).padStart(12, '0')}`;

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
            return 'unknown';
          })();
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
              } else if (tableStr === 'source_pack_items') {
                const id = (v as any).id ?? nextId();
                const row: Record<string, unknown> = { id, createdAt: new Date(), ...v };
                packItemMap.set(String(id), row);
                out.push(row);
              } else {
                out.push({ id: nextId(), ...v });
              }
            }
            return Promise.resolve(out);
          };
          return {
            returning: () => returning(),
            then(onFulfilled: (v: any) => any) { return returning().then(onFulfilled); },
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
            return 'unknown';
          })();
          const allRows = (): Record<string, unknown>[] => {
            if (tableStr === 'file_assets') return Array.from(fileAssetMap.values());
            if (tableStr === 'creator_materials') return Array.from(materialMap.values());
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
              for (const k of variants) {
                if (String((r as any)[k] ?? '') === filterValue) return true;
              }
              if (filterField === 'checksum' && String((r as any).checksum) === filterValue) return true;
              if (filterField === 'id' && String((r as any).id) === filterValue) return true;
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
                for (const row of map.values()) Object.assign(row, patch);
                return Array.from(map.values()).slice(0, 1);
              };
              const returning = () => {
                let rows: Record<string, unknown>[] = [];
                if (tableStr === 'creator_materials') rows = apply(materialMap);
                else if (tableStr === 'file_assets') rows = apply(fileAssetMap);
                else rows = [];
                return Promise.resolve(rows);
              };
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
          const tableStr = (() => {
            const k = tableKey.get(table as object);
            if (k) return k;
            return 'unknown';
          })();
          const delFrom = (map: Map<string, Record<string, unknown>>, field?: string | null) => {
            if (targetId) {
              if (field === 'materialId' || field === 'material_id') {
                for (const [k, v] of map.entries()) if (String((v as any).materialId ?? (v as any).material_id) === targetId) map.delete(k);
              } else if (field === 'fileAssetId' || field === 'file_asset_id') {
                for (const [k, v] of map.entries()) if (String((v as any).fileAssetId ?? (v as any).file_asset_id) === targetId) map.delete(k);
              } else { map.delete(targetId); }
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

  return { fakeDb, fileAssetMap, materialMap, packItemMap, tableKey, nextId, _wireTables: async () => {
    const schema = await import('../../../db/schema.js');
    tableKey.set(schema.fileAssets as unknown as object, 'file_assets');
    tableKey.set(schema.creatorMaterials as unknown as object, 'creator_materials');
    tableKey.set(schema.sourcePackItems as unknown as object, 'source_pack_items');
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
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, Buffer.from('fake png classification test')]);
}

// ── Unit: ClassificationService ────────────────────────────────────────────
describe('Classification', () => {
  let tmpDir: string;
  let storage: LocalStorageAdapter;
  let fakeDbContainer: ReturnType<typeof makeMaterialsFakeDb>;
  let fakeDb: any;
  const userId = 'user-1';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-cls-'));
    storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: 'test-secret-min-32-chars!!' });
    fakeDbContainer = makeMaterialsFakeDb();
    await fakeDbContainer._wireTables();
    fakeDb = fakeDbContainer.fakeDb as any;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeAgentServiceMock(returnValue: { type: string; confidence: number; reasoning: string } | Error): AgentService {
    const run = vi.fn().mockImplementation(async (_id: string, _input: unknown, _ctx: unknown) => {
      if (returnValue instanceof Error) throw returnValue;
      return {
        output: returnValue,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        latencyMs: 50,
        model: 'low-classification-v1',
        provider: '9router' as const,
      };
    });
    return { run } as unknown as AgentService;
  }

  it('verify with userDeclared chart returns aiVerified=chart with confidence', async () => {
    const agentMock = makeAgentServiceMock({ type: 'chart', confidence: 0.92, reasoning: 'Chart shows candlesticks and indicators.' });
    const svc = new ClassificationService({ db: fakeDb, agentService: agentMock, storage, logger: createMockLogger() });

    // Create a material via MaterialsService (userDeclared chart)
    const matSvc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env });
    const buf = pngBuffer();
    const { material } = await matSvc.upload(buf, { originalName: 'chart.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'chart' });

    // Verify
    const updated = await svc.verify(material.id, userId);
    expect((updated.classification as any).aiVerified).toBe('chart');
    expect((updated.classification as any).confidence).toBeCloseTo(0.92);
    expect((updated.classification as any).reasoning).toMatch(/candlesticks/i);
    expect((updated.classification as any).userDeclared).toBe('chart');
    expect((updated.classification as any).verifiedAt).toBeDefined();

    // Check persistence via raw map
    const row = fakeDbContainer.materialMap.get(String(material.id)) as Record<string, unknown>;
    expect((row.classification as any).aiVerified).toBe('chart');

    // agent was called with fileUrl + mimeType + userDeclaredType
    expect(agentMock.run).toHaveBeenCalledWith('material-classifier', expect.objectContaining({ fileUrl: expect.any(String), mimeType: 'image/png', userDeclaredType: 'chart' }), expect.objectContaining({ correlationId: material.id }));
  });

  it('verify without userDeclared predicts type from image', async () => {
    const agentMock = makeAgentServiceMock({ type: 'trade_screenshot', confidence: 0.88, reasoning: 'Screenshot shows trade history table.' });
    const svc = new ClassificationService({ db: fakeDb, agentService: agentMock, storage, logger: createMockLogger() });

    const matSvc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env });
    const buf = pngBuffer();
    // No type -> defaults to document, userDeclared null
    const { material } = await matSvc.upload(buf, { originalName: 'shot.png', mimeType: 'image/png', sizeBytes: buf.length, userId });

    const updated = await svc.verify(material.id, userId);
    expect((updated.classification as any).aiVerified).toBe('trade_screenshot');
    expect((updated.classification as any).confidence).toBeCloseTo(0.88);
    expect((updated.classification as any).userDeclared).toBeNull();

    // agent input should NOT have userDeclaredType
    const callInput = (agentMock.run as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(callInput['userDeclaredType']).toBeUndefined();
  });

  it('verify updates classification jsonb and persists', async () => {
    const agentMock = makeAgentServiceMock({ type: 'news', confidence: 0.75, reasoning: 'Image contains news headline overlay.' });
    const svc = new ClassificationService({ db: fakeDb, agentService: agentMock, storage, logger: createMockLogger() });
    const matSvc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env });
    const buf = pngBuffer();
    const { material } = await matSvc.upload(buf, { originalName: 'news.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'text_note' });

    const before = fakeDbContainer.materialMap.get(String(material.id)) as Record<string, unknown>;
    expect((before.classification as any).aiVerified).toBeNull();

    const updated = await svc.verify(material.id, userId);
    expect((updated.classification as any).aiVerified).toBe('news');

    // Fetch via service getById to confirm persisted
    const fetched = await matSvc.getById(material.id, userId);
    expect((fetched.classification as any).aiVerified).toBe('news');
    expect((fetched.classification as any).confidence).toBe(0.75);
    expect((fetched.classification as any).verifiedAt).toBeDefined();
  });

  it('verify does not throw on agent failure (best-effort) and returns original material', async () => {
    const agentMock = makeAgentServiceMock(new Error('provider down'));
    const logger = createMockLogger();
    const svc = new ClassificationService({ db: fakeDb, agentService: agentMock, storage, logger });

    const matSvc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env });
    const buf = pngBuffer();
    const { material } = await matSvc.upload(buf, { originalName: 'fail.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'chart' });

    const result = await svc.verify(material.id, userId);
    // Should return original without aiVerified
    expect((result.classification as any).aiVerified).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('upload fire-and-forget does not break upload when classification fails', async () => {
    const failingAgent = makeAgentServiceMock(new Error('timeout'));
    const clsSvc = new ClassificationService({ db: fakeDb, agentService: failingAgent, storage, logger: createMockLogger() });
    const matSvc = new MaterialsService({
      db: fakeDb,
      storage,
      logger: createMockLogger(),
      config: { STORAGE_DRIVER: 'local', STORAGE_BUCKET: '', STORAGE_LOCAL_DIR: tmpDir, MAX_UPLOAD_MB: 25, AUTH_SECRET: 's' } as unknown as Env,
      classificationService: clsSvc,
    });

    const buf = pngBuffer();
    // upload should succeed even though background verify will fail
    const res = await matSvc.upload(buf, { originalName: 'bg.png', mimeType: 'image/png', sizeBytes: buf.length, userId, type: 'logo' });
    expect(res.material).toBeDefined();
    expect(res.material.id).toBeDefined();
    // give background tick a chance
    await new Promise((r) => setTimeout(r, 50));
    // material still has aiVerified null (verify failed gracefully)
    const fetched = await matSvc.getById(res.material.id, userId);
    expect((fetched.classification as any).aiVerified).toBeNull();
  });
});

// ── Integration: POST /api/materials/:id/classify route ───────────────────
describe('Classification route POST /api/materials/:id/classify', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let fakeDbContainer: ReturnType<typeof makeMaterialsFakeDb>;
  let agentRunMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kantorku-cls-route-'));
    fakeDbContainer = makeMaterialsFakeDb();
    await fakeDbContainer._wireTables();
    const fakeDb = fakeDbContainer.fakeDb as any;

    agentRunMock = vi.fn().mockResolvedValue({
      output: { type: 'chart', confidence: 0.9, reasoning: 'Route verify ok' },
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      latencyMs: 10,
      model: 'low-classification-v1',
      provider: '9router' as const,
    });

    // Build app with fake DB; override services to use mocks
    app = await buildApp({ logger: false as any, db: fakeDb });

    const config = (app as any).config as Env;
    const storage = new LocalStorageAdapter({ baseDir: tmpDir, secret: String(config.AUTH_SECRET) });
    (app as any).storage = storage;

    const matSvc = new MaterialsService({ db: fakeDb, storage, logger: createMockLogger(), config });
    (app as any).materialsService = matSvc;

    // Mock agentService shape expected by ClassificationService
    const agentServiceMock = { run: agentRunMock } as unknown as AgentService;
    const clsSvc = new ClassificationService({ db: fakeDb, agentService: agentServiceMock, storage, logger: createMockLogger() });
    (app as any).classificationService = clsSvc;
    // Wire fire-and-forget for upload too
    matSvc.setClassificationService(clsSvc);

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function pngBuf(): Buffer {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([sig, Buffer.from('route classification png')]);
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

  it('POST /:id/classify returns updated classification (200)', async () => {
    const token = app.jwt.sign({ sub: 'user-1', email: 'u1@example.com' });
    // Upload first
    const { body, contentType } = buildMultipartPayload({ type: 'chart' }, { filename: 'c.png', mimetype: 'image/png', data: pngBuf() });
    const up = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, payload: body });
    expect(up.statusCode).toBe(200);
    const matId = (up.json() as any).data.material.id as string;

    // Classify via route
    const cls = await app.inject({ method: 'POST', url: `/api/materials/${matId}/classify`, headers: { authorization: `Bearer ${token}` } });
    expect(cls.statusCode).toBe(200);
    const j = cls.json() as any;
    expect(j.success).toBe(true);
    expect(j.data.classification.aiVerified).toBe('chart');
    expect(j.data.classification.confidence).toBe(0.9);
    expect(agentRunMock).toHaveBeenCalledWith('material-classifier', expect.any(Object), expect.objectContaining({ correlationId: matId }));
  });

  it('POST /:id/classify enforces ownership (404 for other user)', async () => {
    const tokenOwner = app.jwt.sign({ sub: 'user-1', email: 'u1@example.com' });
    const tokenOther = app.jwt.sign({ sub: 'user-2', email: 'u2@example.com' });
    const { body, contentType } = buildMultipartPayload({}, { filename: 'a.png', mimetype: 'image/png', data: pngBuf() });
    const up = await app.inject({ method: 'POST', url: '/api/materials/upload', headers: { authorization: `Bearer ${tokenOwner}`, 'content-type': contentType }, payload: body });
    const matId = (up.json() as any).data.material.id as string;

    const res = await app.inject({ method: 'POST', url: `/api/materials/${matId}/classify`, headers: { authorization: `Bearer ${tokenOther}` } });
    expect(res.statusCode).toBe(404);
    expect((res.json() as any).error.code).toBe('MATERIAL_NOT_FOUND');
  });
});
