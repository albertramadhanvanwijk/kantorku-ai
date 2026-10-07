# Phase 3 — Creator Material / Source Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Source Room intake subsystem — upload with validation/checksum, storage adapter (local/S3), classification (user-declared + AI verify), Source Pack grouping with provenance, extraction agents (chart/text/trade), and processing-mode-aware content project creation — so creator materials are traceable and reusable across multiple content projects.

**Architecture:** Storage behind `StorageAdapter` interface (factory selects `local` vs `s3` from `STORAGE_DRIVER`). Upload validates MIME/extension/size/magic-bytes, computes SHA-256, dedups by checksum. `ClassificationService` persists `userDeclared` then async AI-verify via new `material-classifier` agent (vision-capable, `low-classification-v1` policy). `SourcePackService` owns pack + `source_pack_items` join with ordering. Three extraction agents (`chart-metadata-extractor`, `text-content-extractor`, `trade-data-parser`) extend `BaseAgent` and reuse `NineRouterGateway`. Content project creation selects mode (`transform` vs `analyze`) per PRD §8.

**Tech Stack:** TypeScript strict, Fastify 5 + `@fastify/multipart`, drizzle-orm + PostgreSQL, Zod 3, native `crypto` (SHA-256), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3 only), `NineRouterGateway` + `BaseAgent` (Phase 2), Vitest, Pino

**Spec:** `docs/superpowers/specs/2026-10-06-phase3-creator-material-source-room-design.md`

## Global Constraints

- TypeScript strict where practical; no `any` without justification; explicit interfaces at module boundaries (DEVELOPMENT-RULES.md §1).
- All schema/contract changes via migrations; additive/idempotent; UTC timestamps; FKs where integrity requires (DEVELOPMENT-RULES.md §4, DATA-MODEL.md §12).
- Consistent error envelope `{ success: false, error: { code, message, details } }`; validated request/response schemas; auth at boundary; idempotent pack operations (DEVELOPMENT-RULES.md §3/§5).
- Provider-specific code behind `NineRouterGateway`; never expose hidden chain-of-thought; persist provider/model, prompt_version, usage, latency, correlationId (AGENTS.md §4).
- Structured outputs via Zod→JSON Schema; never transition workflow state from unvalidated free-form text (DEVELOPMENT-RULES.md §6).
- Creator Source Priority: AI may organize/summarize but must not silently replace creator thesis; provenance preserved on every material/insight (AGENTS.md §5, PRD §8).
- Never hardcode secrets, brand assets, or promotional copy; keep provider credentials server-side (AGENTS.md §7, §3).
- No secrets in repo/logs/DB; least privilege; validate MIME/size/extension on uploads; sanitize filenames (AGENTS.md §7).
- Reuse existing abstractions before duplicating; keep business rules out of UI; small composable modules (AGENTS.md §3).
- `STORAGE_DRIVER` defaults to `local`; S3 path requires `STORAGE_BUCKET` + creds; `MAX_UPLOAD_MB` default 25 (packages/shared/src/env.ts).

## Review Focus

1. **Duplicate upload with same checksum** — same file uploaded twice; expect second call returns existing `file_asset` (no duplicate storage) but creates new `creator_material` referencing it, or configurable dedup per spec §17 Q1 (test pins chosen behavior).
2. **Oversized / disallowed file** — 26 MB or `.exe` with `image/png` MIME; expect 413 `FILE_TOO_LARGE` or 415 `INVALID_FILE_TYPE` before any storage write, magic-bytes mismatch also rejected.
3. **Classification without user-declared type** — upload with no `type` field; expect material stored with `classification.userDeclared=null`, async AI verify fills `aiVerified` with confidence; read returns both fields.
4. **Source Pack duplicate item** — `POST /api/source-packs/:id/items { materialIds: [sameId, sameId] }`; expect unique constraint `(sourcePackId, materialId)` prevents duplicate, second is idempotent/no-op, order preserved.
5. **Signed URL expiry / private access** — direct file access without signed URL; expect 401/404, signed URL valid for `ttlSeconds` (default 3600) then expires, no public bucket listing.

---

## File Structure

```
apps/api/src/db/schema.ts                          # add 4 tables (modify)
packages/shared/src/errors.ts                      # add 7 error codes + helpers (modify)
packages/shared/src/schemas.ts                     # add material/pack Zod fragments (modify)

apps/api/src/modules/materials/
  storage/
    adapter.ts                                     # StorageAdapter interface + SaveResult
    local.adapter.ts                               # LocalStorageAdapter
    s3.adapter.ts                                  # S3StorageAdapter
    index.ts                                       # createStorageAdapter factory
  materials.service.ts                             # upload/create/get/list/update/delete, checksum, dedup
  materials.routes.ts                              # POST /upload, GET /, GET /:id, PATCH /:id, DELETE /:id, POST /:id/extract
  classification.service.ts                        # classify + verify via agent
  sourcePacks.service.ts                           # CRUD + items add/remove/reorder
  sourcePacks.routes.ts                            # /api/source-packs/* routes

apps/api/src/modules/agents/prompts/
  materialClassifier.v1.ts                         # prompt for material-classifier@1.0.0
  chartExtractor.v1.ts                             # prompt for chart-metadata-extractor@1.0.0
  textExtractor.v1.ts                              # prompt for text-content-extractor@1.0.0
  tradeParser.v1.ts                                # prompt for trade-data-parser@1.0.0

apps/api/src/modules/agents/agents/
  materialClassifier.agent.ts                      # MaterialClassifierAgent extends BaseAgent
  chartExtractor.agent.ts                          # ChartExtractorAgent
  textExtractor.agent.ts                           # TextExtractorAgent
  tradeParser.agent.ts                             # TradeParserAgent

apps/api/src/modules/content/
  projects.service.ts                              # content project creation with mode (transform vs analyze)
  projects.routes.ts                               # POST /api/content-projects

apps/web/pages/source-room/
  index.vue                                        # pack list + material grid
  [id].vue                                         # pack detail with items
  upload.vue                                       # drag-drop upload

apps/api/src/modules/materials/__tests__/
  storage.test.ts
  materials.test.ts
  classification.test.ts
  sourcePacks.test.ts
  extraction.test.ts
  e2e.materials.test.ts
```

---

### Task 1: Database Schema + Migrations + Shared Contracts

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/schemas.ts` (add `materialTypeSchema`, `pagination` reuse)
- Create: `apps/api/drizzle/0003_phase3_source_room.sql` (via `drizzle-kit generate`)
- Test: `apps/api/src/db/schema.test.ts` (extend) and `packages/shared/src/errors.test.ts` (extend)

**Interfaces:**
- Consumes: existing `users`, `audit_events`, `agent_definitions` etc; `AppError` helpers; `envSchema` (`MAX_UPLOAD_MB`, `STORAGE_*`)
- Produces:
  - Tables `file_assets`, `creator_materials`, `source_packs`, `source_pack_items` per Spec §4.1 (exact columns/types, FKs, unique `(sourcePackId, materialId)`, indexes)
  - Error helpers: `fileTooLarge(msg, details?)` → 413 `FILE_TOO_LARGE`, `invalidFileType(msg, details?)` → 415 `INVALID_FILE_TYPE`, `storageError(msg, details?)` → 500 `STORAGE_ERROR`, `materialNotFound(msg?)` → 404, `sourcePackNotFound(msg?)` → 404, `extractionFailed(msg, details?)` → 500, `checksumMismatch(msg, details?)` → 400
  - Zod: `materialTypeSchema = z.enum(['chart','trade_screenshot','text_note','news','promo_asset','logo','document'])`

- [ ] **Step 1: Write failing test `apps/api/src/db/schema.test.ts` (extend existing)**

```ts
import * as schema from './schema.js';
describe('Phase 3 schema', () => {
  it('exports file_assets with checksum unique', () => expect(schema.fileAssets).toBeDefined());
  it('exports creator_materials with type enum', () => expect(schema.creatorMaterials).toBeDefined());
  it('exports source_packs', () => expect(schema.sourcePacks).toBeDefined());
  it('exports source_pack_items with pack+material unique', () => expect(schema.sourcePackItems).toBeDefined());
});
```
And `packages/shared/src/errors.test.ts` assert new helpers produce correct `code`/`statusCode`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kantorku/api test -- src/db/schema.test.ts` and `pnpm --filter @kantorku/shared test`
Expected: FAIL — tables/helpers not defined

- [ ] **Step 3: Implement 4 tables in `apps/api/src/db/schema.ts`**

Add `file_assets` (uuid PK, storageDriver varchar(20), bucket varchar(255), key varchar(500) notNull, originalName varchar(500) notNull, mimeType varchar(100) notNull, sizeBytes bigint notNull, checksum varchar(64) notNull unique, uploadedBy FK users.id, createdAt timestamptz), `creator_materials` (uuid PK, type varchar(50) notNull, title varchar(500), fileAssetId FK file_assets.id, metadata jsonb, classification jsonb, provenance jsonb, createdAt/updatedAt timestamptz), `source_packs` (uuid PK, name varchar(500) notNull, description text, createdBy FK users.id, createdAt/updatedAt), `source_pack_items` (uuid PK, sourcePackId FK source_packs.id cascade, materialId FK creator_materials.id cascade, sortOrder integer notNull default 0, notes text, createdAt, unique(sourcePackId, materialId), indexes on sourcePackId, materialId). Use `pgTable`, `uuid`, `varchar`, `text`, `bigint`, `integer`, `jsonb`, `timestamp`, `index`, `unique`.

- [ ] **Step 4: Extend `packages/shared/src/errors.ts`**

Add to `ErrorCode`: `'FILE_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'STORAGE_ERROR' | 'CHECKSUM_MISMATCH' | 'MATERIAL_NOT_FOUND' | 'SOURCE_PACK_NOT_FOUND' | 'EXTRACTION_FAILED'` and export helpers `fileTooLarge`, `invalidFileType`, `storageError`, `checksumMismatch`, `materialNotFound`, `sourcePackNotFound`, `extractionFailed` mirroring existing helpers with correct status codes per Spec §12.

- [ ] **Step 5: Add `materialTypeSchema` to `packages/shared/src/schemas.ts`**

Export `materialTypeSchema` and `createMaterialSchema` / `updateMaterialSchema` fragments if needed by routes (keep minimal; routes do full validation).

- [ ] **Step 6: Generate and verify migration**

Run: `pnpm --filter @kantorku/api db:generate` then `pnpm --filter @kantorku/api db:migrate` (when DB reachable; else verify SQL file exists and is additive).
Expected: `drizzle/0003_*.sql` with 4 CREATE TABLE + FKs + indexes; no existing tables altered.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/db/schema.test.ts` and `pnpm --filter @kantorku/shared test` and `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts packages/shared/src/errors.ts packages/shared/src/schemas.ts apps/api/drizzle/0003_* apps/api/src/db/schema.test.ts packages/shared/src/errors.test.ts pnpm-lock.yaml
git commit -m "feat(db): Phase 3 source room tables + error codes + material type schema"
```

---

### Task 2: Storage Adapter (Local + S3)

**Files:**
- Create: `apps/api/src/modules/materials/storage/adapter.ts`
- Create: `apps/api/src/modules/materials/storage/local.adapter.ts`
- Create: `apps/api/src/modules/materials/storage/s3.adapter.ts`
- Create: `apps/api/src/modules/materials/storage/index.ts`
- Test: `apps/api/src/modules/materials/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `AppConfig` / `Env` (`STORAGE_DRIVER`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_LOCAL_DIR`), `AppError` (`storageError`), Node `crypto` for SHA-256
- Produces:
  ```ts
  // adapter.ts
  export interface SaveResult { key: string; checksum: string; sizeBytes: number; }
  export interface StorageAdapter {
    save(file: Buffer, opts: { originalName: string; mimeType: string; userId: string }): Promise<SaveResult>;
    getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
  }
  // index.ts
  export function createStorageAdapter(config: Env, deps?: { s3Client?: unknown }): StorageAdapter;
  ```

- [ ] **Step 1: Write failing test `__tests__/storage.test.ts`**

```ts
describe('StorageAdapter', () => {
  it('local save returns key/checksum/size and file exists', async () => { /* save Buffer, expect exists true, checksum is hex 64 */ });
  it('local getSignedUrl returns url containing key and expires param', async () => { /* expect url includes key */ });
  it('local delete removes file', async () => { /* save then delete, exists false */ });
  it('factory selects local when STORAGE_DRIVER=local', () => { expect(createStorageAdapter({ STORAGE_DRIVER:'local', ... }).constructor.name).toMatch(/Local/) });
  it('factory selects s3 when STORAGE_DRIVER=s3 (mocked client)', () => { /* inject mock s3Client, no real AWS call */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/storage.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement `adapter.ts` (interface only)**

Export `StorageAdapter` and `SaveResult` per Spec §5, no logic.

- [ ] **Step 4: Implement `local.adapter.ts`**

`LocalStorageAdapter implements StorageAdapter`: `save` sanitizes filename (strip path, replace unsafe chars), key = `{userId}/{uuid}/{safeName}`, writes to `STORAGE_LOCAL_DIR/{key}`, computes `sha256` hex via `crypto.createHash`, returns `{key, checksum, sizeBytes}`; `getSignedUrl` returns `/api/files/{key}?expires={now+ttl}&sig={hmac}` (HMAC with `AUTH_SECRET` for local verification) or simple local URL for dev; `delete` unlinks; `exists` checks `fs.existsSync`. Create dirs recursively. On write failure throw `storageError`.

- [ ] **Step 5: Implement `s3.adapter.ts`**

`S3StorageAdapter`: constructor takes `{ bucket, endpoint, accessKey, secretKey, s3Client? }`; `save` does `PutObject` with `Key`, `Body`, `ContentType`, computes checksum same as local; `getSignedUrl` uses `@aws-sdk/s3-request-presigner` `getSignedUrl(s3Client, new GetObjectCommand({Bucket, Key}), {expiresIn: ttl})`; `delete` does `DeleteObject`; `exists` does `HeadObject` (404 → false). On AWS error throw `storageError` with `details.cause`.

- [ ] **Step 6: Implement `index.ts` factory**

`createStorageAdapter(config)` reads `STORAGE_DRIVER`; if `local` return `new LocalStorageAdapter({ baseDir: config.STORAGE_LOCAL_DIR, secret: config.AUTH_SECRET })`; if `s3` return `new S3StorageAdapter({ bucket: config.STORAGE_BUCKET, endpoint: config.STORAGE_ENDPOINT, ... })`; else throw `validationError`. Allow `deps.s3Client` injection for tests.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/storage.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS (local adapter uses temp dir, S3 mocked)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/materials/storage/ apps/api/src/modules/materials/__tests__/storage.test.ts pnpm-lock.yaml
git commit -m "feat(storage): local + S3 adapters with factory and signed URLs"
```

---

### Task 3: Upload API + Validation

**Files:**
- Create: `apps/api/src/modules/materials/materials.service.ts`
- Create: `apps/api/src/modules/materials/materials.routes.ts`
- Test: `apps/api/src/modules/materials/__tests__/materials.test.ts`

**Interfaces:**
- Consumes: `StorageAdapter` (Task 2), `file_assets`/`creator_materials` tables (Task 1), `AppError` helpers, `materialTypeSchema`, `@fastify/multipart` types
- Produces:
  ```ts
  // materials.service.ts
  export class MaterialsService {
    constructor(deps: { db: Db; storage: StorageAdapter; logger: Logger; config: Env });
    upload(file: Buffer, meta: { originalName: string; mimeType: string; sizeBytes: number; userId: string; title?: string; type?: MaterialType; sourcePackId?: string }): Promise<{ material: CreatorMaterial; fileAsset: FileAsset }>;
    list(opts: { userId: string; type?: MaterialType; sourcePackId?: string; page: number; pageSize: number }): Promise<{ rows: CreatorMaterial[]; total: number }>;
    getById(id: string, userId: string): Promise<CreatorMaterial>;
    update(id: string, userId: string, patch: { title?: string; type?: MaterialType; metadata?: unknown }): Promise<CreatorMaterial>;
    delete(id: string, userId: string): Promise<void>;
  }
  // routes: POST /api/materials/upload (multipart), GET /api/materials, GET /api/materials/:id, PATCH /api/materials/:id, DELETE /api/materials/:id
  ```

- [ ] **Step 1: Write failing test `__tests__/materials.test.ts` (service + routes via inject)**

```ts
describe('Materials upload', () => {
  it('upload valid png creates file_asset + material (200)', async () => { /* inject POST /upload multipart, expect 200, material.id, fileAsset.checksum 64 hex */ });
  it('upload oversized returns 413 FILE_TOO_LARGE', async () => { /* file > MAX_UPLOAD_MB */ });
  it('upload disallowed extension returns 415 INVALID_FILE_TYPE', async () => { /* .exe */ });
  it('upload duplicate checksum reuses file_asset but creates new material (dedup)', async () => { /* same bytes twice, file_assets count 1, materials count 2 */ });
  it('list/get/patch/delete enforce ownership (other user 404)', async () => { /* user isolation */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/materials.test.ts`
Expected: FAIL — routes not registered

- [ ] **Step 3: Implement `materials.service.ts`**

`upload`: validate MIME allowlist (`image/*`, `application/pdf`, `text/*`, `application/json`), extension allowlist (`.png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.json`), size ≤ `MAX_UPLOAD_MB * 1024*1024` else `fileTooLarge`, magic-bytes check (PNG `89 50 4E 47`, JPG `FF D8`, PDF `%PDF`), sanitize `originalName` (basename, max 200 chars, replace `[^a-zA-Z0-9._-]`), compute `sha256` hex, check `file_assets` by `checksum` — if exists reuse `fileAsset` row else call `storage.save` then `insert file_assets` with `uploadedBy=userId`, then `insert creator_materials` with `type ?? 'document'`, `title ?? originalName`, `fileAssetId`, `classification={ userDeclared: type ?? null, aiVerified: null, confidence: null }`, `provenance={ uploadedAt, userId }`. Return both. `list/get/update/delete` enforce `userId` ownership via `file_assets.uploadedBy` join; `delete` also removes `source_pack_items` refs then `file_asset` if no other material references it (ref count).

- [ ] **Step 4: Implement `materials.routes.ts` (Fastify plugin)**

Register `@fastify/multipart` (limits `fileSize: MAX_UPLOAD_MB*1024*1024`). `POST /api/materials/upload` — `preHandler: [authenticate]`, parse `request.file()`, read buffer, call `service.upload`, return `{ success:true, data:{ material, fileAsset: { key, url: await storage.getSignedUrl(key), mimeType, sizeBytes } } }`. `GET /api/materials` — query `type`, `sourcePackId`, `page`, `pageSize` (Zod), call `list`. `GET /:id`, `PATCH /:id`, `DELETE /:id` — authenticate + Zod. Map `AppError` to envelope via global handler (already exists).

- [ ] **Step 5: Wire in `apps/api/src/app.ts`**

Import and register `materialsRoutes` plugin under `/api`; instantiate `MaterialsService` with `db`, `createStorageAdapter(config)`, `logger`, `config`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/materials.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS (multipart mocked via inject, storage uses temp dir)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/materials/materials.service.ts apps/api/src/modules/materials/materials.routes.ts apps/api/src/modules/materials/__tests__/materials.test.ts apps/api/src/app.ts
git commit -m "feat(materials): upload with validation, checksum dedup, and CRUD routes"
```

---

### Task 4: Classification Service + Agent

**Files:**
- Create: `apps/api/src/modules/agents/prompts/materialClassifier.v1.ts`
- Create: `apps/api/src/modules/agents/agents/materialClassifier.agent.ts`
- Create: `apps/api/src/modules/materials/classification.service.ts`
- Test: `apps/api/src/modules/materials/__tests__/classification.test.ts`

**Interfaces:**
- Consumes: `BaseAgent`, `AgentRegistry`, `NineRouterGateway`, `StorageAdapter`, `creator_materials` table, `routingPolicy` (`classification` policy, add vision-capable model if needed)
- Produces:
  ```ts
  // materialClassifier.agent.ts
  export const materialClassifierInputSchema = z.object({ fileUrl: z.string().url(), mimeType: z.string(), userDeclaredType: z.enum([...]).optional() });
  export const materialClassifierOutputSchema = z.object({ type: materialTypeSchema, confidence: z.number().min(0).max(1), reasoning: z.string() });
  export class MaterialClassifierAgent extends BaseAgent<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> { ... }

  // classification.service.ts
  export class ClassificationService {
    constructor(deps: { db: Db; agentService: AgentService; storage: StorageAdapter; logger: Logger });
    verify(materialId: string, userId: string): Promise<CreatorMaterial>; // calls agent, updates classification jsonb
  }
  ```

- [ ] **Step 1: Write failing test `__tests__/classification.test.ts`**

```ts
describe('Classification', () => {
  it('verify with userDeclared chart returns aiVerified=chart with confidence', async () => { /* mock gateway to return {type:'chart', confidence:0.9} */ });
  it('verify without userDeclared predicts type from image', async () => { /* mock returns trade_screenshot */ });
  it('verify updates classification jsonb and persists', async () => { /* check DB row classification.aiVerified */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/classification.test.ts`
Expected: FAIL — agent not registered

- [ ] **Step 3: Implement `materialClassifier.v1.ts`**

Export `PROMPT_VERSION='material-classifier@1.0.0'` and `SYSTEM_PROMPT` instructing: classify into 7 types, never fabricate, preserve creator intent, output JSON with `type`, `confidence` (0-1), `reasoning` (1 sentence). Must-do: respect Creator Source Priority, no hallucination.

- [ ] **Step 4: Implement `materialClassifier.agent.ts`**

Define `materialClassifierInputSchema`/`OutputSchema` per Spec §7, `materialClassifierDefinition` (`id='material-classifier'`, version `1.0.0`, `promptVersion`, `modelPolicy='classification'`, `allowedTools=[]`), class `MaterialClassifierAgent extends BaseAgent` with `buildMessages` returning `[{role:'system', content: SYSTEM_PROMPT}, {role:'user', content: JSON.stringify(input)}]`. Register via `ALL_AGENT_DEFINITIONS` in `agents/index.ts`.

- [ ] **Step 5: Implement `classification.service.ts`**

`verify(materialId, userId)`: load material + file_asset (ownership check), get signed URL via `storage.getSignedUrl(fileAsset.key)`, call `agentService.run('material-classifier', { fileUrl, mimeType, userDeclaredType: material.type }, { correlationId: material.id })`, on success update `creator_materials` row `classification = { userDeclared, aiVerified: output.type, confidence: output.confidence, reasoning: output.reasoning, verifiedAt: now }`, return updated material. On agent failure log warning, do not throw (classification optional; material remains usable). Ensure `routingPolicy.ts` has vision-capable `low-classification-v1` (already present per Task 2 review).

- [ ] **Step 6: Integrate with upload flow**

Modify `materials.service.ts` `upload` to `void classificationService.verify(newMaterial.id, userId).catch(...)` after insert (fire-and-forget, best-effort). Also expose `POST /api/materials/:id/classify` route for manual re-verify.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/classification.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS (gateway mocked, no real 9Router call)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agents/prompts/materialClassifier.v1.ts apps/api/src/modules/agents/agents/materialClassifier.agent.ts apps/api/src/modules/agents/agents/index.ts apps/api/src/modules/materials/classification.service.ts apps/api/src/modules/materials/__tests__/classification.test.ts apps/api/src/modules/materials/materials.service.ts
git commit -m "feat(classification): material-classifier agent + verify flow"
```

---

### Task 5: Source Pack CRUD

**Files:**
- Create: `apps/api/src/modules/materials/sourcePacks.service.ts`
- Create: `apps/api/src/modules/materials/sourcePacks.routes.ts`
- Test: `apps/api/src/modules/materials/__tests__/sourcePacks.test.ts`

**Interfaces:**
- Consumes: `source_packs` + `source_pack_items` + `creator_materials` tables, `AppError`, `Db`
- Produces:
  ```ts
  // sourcePacks.service.ts
  export class SourcePacksService {
    constructor(deps: { db: Db; logger: Logger });
    create(opts: { name: string; description?: string; materialIds?: string[]; userId: string }): Promise<SourcePack>;
    list(opts: { userId: string; page: number; pageSize: number }): Promise<{ rows: SourcePack[]; total: number }>;
    getById(id: string, userId: string): Promise<SourcePackWithItems>;
    update(id: string, userId: string, patch: { name?: string; description?: string }): Promise<SourcePack>;
    delete(id: string, userId: string): Promise<void>;
    addItems(packId: string, userId: string, materialIds: string[], sortOrder?: number): Promise<SourcePackWithItems>;
    removeItem(packId: string, userId: string, materialId: string): Promise<void>;
    reorder(packId: string, userId: string, order: Array<{ materialId: string; sortOrder: number }>): Promise<SourcePackWithItems>;
  }
  // routes: GET/POST /api/source-packs, GET/PATCH/DELETE /api/source-packs/:id, POST /:id/items, DELETE /:id/items/:materialId, PATCH /:id/items/reorder
  ```

- [ ] **Step 1: Write failing test `__tests__/sourcePacks.test.ts`**

```ts
describe('SourcePacks', () => {
  it('create pack with materials returns pack with items', async () => { /* POST /source-packs {name, materialIds} 201 */ });
  it('list respects ownership and pagination', async () => { /* user isolation */ });
  it('addItems idempotent on duplicate materialId', async () => { /* same id twice, count stays 1 */ });
  it('reorder updates sortOrder', async () => { /* PATCH reorder, verify order */ });
  it('delete pack cascades items but not materials', async () => { /* delete pack, items gone, materials remain */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/sourcePacks.test.ts`
Expected: FAIL — routes not found

- [ ] **Step 3: Implement `sourcePacks.service.ts`**

`create`: Zod validate `name` min1, `description` optional, `materialIds` optional array of uuids; `insert source_packs { name, description, createdBy: userId }`, if `materialIds` then `insert source_pack_items` each with `sortOrder = index`, verify each `materialId` exists and owned by `userId` (via file_assets join) else `materialNotFound`. `list` paginated `eq(createdBy, userId)` with `limit/offset`. `getById` joins `source_packs` + `source_pack_items` + `creator_materials`, orders by `sortOrder`, throws `sourcePackNotFound` if not owned. `update` patches allowed fields. `delete` deletes `source_packs` row (cascade deletes items via FK). `addItems` inserts each `materialId` with `onConflictDoNothing` (unique constraint) for idempotency, assigns `sortOrder = max+1` if not provided. `removeItem` deletes join row. `reorder` updates each `sortOrder` in transaction.

- [ ] **Step 4: Implement `sourcePacks.routes.ts`**

Fastify plugin, all routes `preHandler: [authenticate]`, Zod validation at boundary, consistent envelope, pagination `page/pageSize` query (defaults page 1, pageSize 20, max 100). Map `sourcePackNotFound`/`materialNotFound` to 404.

- [ ] **Step 5: Wire in `apps/api/src/app.ts`**

Register `sourcePacksRoutes` plugin.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/sourcePacks.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/materials/sourcePacks.service.ts apps/api/src/modules/materials/sourcePacks.routes.ts apps/api/src/modules/materials/__tests__/sourcePacks.test.ts apps/api/src/app.ts
git commit -m "feat(packs): Source Pack CRUD with items add/remove/reorder"
```

---

### Task 6: Extraction Agents (Chart / Text / Trade)

**Files:**
- Create: `apps/api/src/modules/agents/prompts/chartExtractor.v1.ts`
- Create: `apps/api/src/modules/agents/prompts/textExtractor.v1.ts`
- Create: `apps/api/src/modules/agents/prompts/tradeParser.v1.ts`
- Create: `apps/api/src/modules/agents/agents/chartExtractor.agent.ts`
- Create: `apps/api/src/modules/agents/agents/textExtractor.agent.ts`
- Create: `apps/api/src/modules/agents/agents/tradeParser.agent.ts`
- Create: `apps/api/src/modules/materials/extraction.service.ts`
- Modify: `apps/api/src/modules/materials/materials.routes.ts` (add `POST /api/materials/:id/extract`)
- Test: `apps/api/src/modules/materials/__tests__/extraction.test.ts`

**Interfaces:**
- Consumes: `BaseAgent`, `ToolRegistry` (`fetch_url`), `NineRouterGateway`, `StorageAdapter`, `creator_materials` table
- Produces:
  ```ts
  // chartExtractor.agent.ts
  export const chartExtractorInputSchema = z.object({ fileUrl: z.string().url(), mimeType: z.string() });
  export const chartExtractorOutputSchema = z.object({ instrument: z.string().optional(), timeframe: z.string().optional(), indicators: z.array(z.string()).default([]), priceLevels: z.array(z.number()).default([]), chartType: z.string().optional(), confidence: z.number().min(0).max(1) });
  // textExtractor: { extractedText: string, language: string.optional(), structure: string.optional(), entities: string[].default([]) }
  // tradeParser: { trades: z.array(z.object({ instrument: string, direction: z.enum(['long','short']), entry: z.number().optional(), exit: z.number().optional(), sl: z.number().optional(), tp: z.number().optional(), timeframe: z.string().optional(), result: z.string().optional(), openedAt: z.string().optional(), closedAt: z.string().optional(), notes: z.string().optional() })) }
  // extraction.service.ts
  export class ExtractionService {
    constructor(deps: { db: Db; agentService: AgentService; storage: StorageAdapter; logger: Logger });
    extract(materialId: string, userId: string, type: 'chart'|'text'|'trade'): Promise<CreatorMaterial>;
    extractAuto(materialId: string, userId: string): Promise<void>; // picks based on material.type
  }
  ```

- [ ] **Step 1: Write failing test `__tests__/extraction.test.ts`**

```ts
describe('Extraction', () => {
  it('chart extract on chart material returns instrument/timeframe/indicators', async () => { /* mock gateway returns BTC, 4H, RSI */ });
  it('text extract returns extractedText', async () => { /* mock */ });
  it('trade extract returns trades array', async () => { /* mock */ });
  it('POST /materials/:id/extract triggers and persists metadata', async () => { /* inject, 200, check material.metadata */ });
  it('auto extract on upload for chart type', async () => { /* upload chart, verify metadata populated */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/extraction.test.ts`
Expected: FAIL — agents not registered

- [ ] **Step 3: Implement 3 prompt files**

Each exports `PROMPT_VERSION` (`chart-extractor@1.0.0`, `text-extractor@1.0.0`, `trade-parser@1.0.0`) and `SYSTEM_PROMPT` per Spec §9.1-9.3: chart prompt asks to identify instrument/timeframe/indicators/price levels; text prompt to OCR/extract; trade prompt to parse trades. All must-do: structured JSON only, never fabricate unsupported values.

- [ ] **Step 4: Implement 3 agent files**

Each defines input/output Zod schemas, `Definition` (`slug`, `version`, `promptVersion`, `modelPolicy`: chart→`research` (vision), text→`research`, trade→`strategy`, `allowedTools: ['fetch_url']` for chart/text if needed else `[]`), class extends `BaseAgent` with `buildMessages`. Register all in `agents/index.ts` `ALL_AGENT_DEFINITIONS`.

- [ ] **Step 5: Implement `extraction.service.ts`**

`extract(materialId, userId, type)`: load material (ownership), get signed URL, select agent id `chart-metadata-extractor` / `text-content-extractor` / `trade-data-parser`, call `agentService.run`, on success merge `output` into `creator_materials.metadata` via `jsonb` update (`metadata = { ...existing, extraction: output, extractedAt }`), return updated material. `extractAuto` switches on `material.type`: `chart`→chart, `trade_screenshot`→trade, `document`→text, others no-op. Failures throw `extractionFailed` but service logs warning (extraction is best-effort; material remains).

- [ ] **Step 6: Add route `POST /api/materials/:id/extract`**

In `materials.routes.ts`: authenticate, Zod body `{ type: z.enum(['chart','text','trade']).optional() }` — if no type, call `extractAuto`, else `extract` with type. Return updated material. Add `GET /api/materials/:id/metadata` if useful (or reuse `GET /:id`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/extraction.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS (gateway mocked)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agents/prompts/chartExtractor.v1.ts apps/api/src/modules/agents/prompts/textExtractor.v1.ts apps/api/src/modules/agents/prompts/tradeParser.v1.ts apps/api/src/modules/agents/agents/chartExtractor.agent.ts apps/api/src/modules/agents/agents/textExtractor.agent.ts apps/api/src/modules/agents/agents/tradeParser.agent.ts apps/api/src/modules/agents/agents/index.ts apps/api/src/modules/materials/extraction.service.ts apps/api/src/modules/materials/__tests__/extraction.test.ts apps/api/src/modules/materials/materials.routes.ts
git commit -m "feat(extraction): chart/text/trade agents + extraction service"
```

---

### Task 7: Processing Modes Integration (Content Project Creation)

**Files:**
- Create: `apps/api/src/modules/content/projects.service.ts`
- Create: `apps/api/src/modules/content/projects.routes.ts`
- Modify: `apps/api/src/db/schema.ts` (add `content_projects` table if not exists, or reuse `workflow_definitions` pattern)
- Test: `apps/api/src/modules/content/__tests__/projects.test.ts`

**Interfaces:**
- Consumes: `source_packs` + `creator_materials` tables, `WorkflowEngine` (Phase 2), `AgentService`
- Produces:
  ```ts
  // projects.service.ts
  export type ProcessingMode = 'transform' | 'analyze';
  export class ContentProjectsService {
    constructor(deps: { db: Db; workflowEngine: WorkflowEngine; logger: Logger });
    create(opts: { sourcePackId: string; mode: ProcessingMode; brief?: string; userId: string }): Promise<{ project: ContentProject; execution: WorkflowExecution }>;
    getById(id: string, userId: string): Promise<ContentProject>;
    list(opts: { userId: string; page: number; pageSize: number }): Promise<{ rows: ContentProject[]; total: number }>;
  }
  // routes: POST /api/content-projects { sourcePackId, mode, brief? }, GET /api/content-projects, GET /api/content-projects/:id
  ```

- [ ] **Step 1: Write failing test `__tests__/projects.test.ts`**

```ts
describe('Content Projects', () => {
  it('create transform project from pack creates execution with transform mode', async () => { /* POST 201, execution.input.mode==='transform' */ });
  it('create analyze project separates ai_analysis from creator_material', async () => { /* mode==='analyze', execution separates */ });
  it('create with invalid pack returns 404', async () => { /* 404 SOURCE_PACK_NOT_FOUND */ });
  it('same pack can produce both modes (two projects)', async () => { /* create transform then analyze on same pack, both succeed */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/content/__tests__/projects.test.ts`
Expected: FAIL — routes not found

- [ ] **Step 3: Add `content_projects` table to `schema.ts` (or reuse workflow)**

Option A (minimal): `content_projects` (uuid PK, sourcePackId FK source_packs.id, mode varchar(20) notNull, brief text, status varchar(50) notNull default 'pending', workflowExecutionId FK workflow_executions.id nullable, createdBy FK users.id, createdAt/updatedAt). Indexes on `sourcePackId`, `createdBy`, `mode`. Alternative: if team prefers, map to `workflow_definitions` with `mode` in `definition` jsonb — choose one and document. Migration `0004_content_projects` (if new table) or `0003` already includes.

- [ ] **Step 4: Implement `projects.service.ts`**

`create`: validate `sourcePackId` exists and owned by `userId` else `sourcePackNotFound`, Zod `mode` enum, load pack items with materials, build workflow input `{ sourcePack: { id, items: [...materials with metadata] }, mode, brief, provenance: { packId, materialIds } }`, create `content_projects` row, optionally trigger `workflowEngine.execute` for `content-production-v1` workflow with mode-aware input, return project + execution. `getById`/`list` enforce ownership.

- [ ] **Step 5: Implement `projects.routes.ts`**

Fastify plugin, `POST /api/content-projects` authenticate + Zod, `GET /api/content-projects` paginated, `GET /:id`. Return envelope.

- [ ] **Step 6: Wire in `app.ts`**

Register `projectsRoutes`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @kantorku/api test -- src/modules/content/__tests__/projects.test.ts` and `pnpm --filter @kantorku/api typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/modules/content/ apps/api/src/app.ts apps/api/drizzle/0004_* pnpm-lock.yaml
git commit -m "feat(content): processing modes (transform vs analyze) with project creation"
```

---

### Task 8: Minimal Source Room UI

**Files:**
- Create: `apps/web/pages/source-room/index.vue`
- Create: `apps/web/pages/source-room/[id].vue`
- Create: `apps/web/pages/source-room/upload.vue`
- Create: `apps/web/components/source-room/MaterialCard.vue`
- Create: `apps/web/components/source-room/SourcePackCard.vue`
- Create: `apps/web/components/source-room/UploadDropzone.vue`
- Create: `apps/web/composables/useMaterials.ts`
- Create: `apps/web/composables/useSourcePacks.ts`

**Interfaces:**
- Consumes: `/api/materials/*` and `/api/source-packs/*` endpoints (Tasks 3,5), existing `MainLayout`, `Card`, `Button`, `Badge` UI components
- Produces: Pages navigable via sidebar `Source Room` entry; drag-drop upload with preview; pack list grid; material grid filtered by type; pack detail with reorder via drag.

- [ ] **Step 1: Create `UploadDropzone.vue`**

Props: `accept` (mime list), `maxSizeMb`, `multiple?`; emits `files-selected: File[]`; handles `dragenter/dragover/drop` with visual feedback, click to browse, file validation before emit (size, extension), shows file list with name/size/type badge, progress bar slot.

- [ ] **Step 2: Create `MaterialCard.vue` and `SourcePackCard.vue`**

`MaterialCard`: props `material: { id, type, title, classification, createdAt, fileAsset: { url, mimeType } }`; displays thumbnail (image) or icon by type, type badge, classification confidence, title, date, actions (add to pack, extract, delete). `SourcePackCard`: props `pack: { id, name, itemCount, createdAt }`; displays name, item count, date, actions.

- [ ] **Step 3: Create composables `useMaterials.ts` / `useSourcePacks.ts`**

`useMaterials`: `list(params)`, `upload(file, meta)`, `getById(id)`, `extract(id, type?)`, `delete(id)` — wrappers over `$fetch` with auth header from `useAuth()`, reactive `materials`, `loading`, `error`. `useSourcePacks`: `list`, `create`, `getById`, `addItems`, `removeItem`, `reorder` similarly.

- [ ] **Step 4: Create pages**

`source-room/index.vue`: two tabs — Materials (grid of `MaterialCard`, filter by `materialType`, pagination) + Packs (grid of `SourcePackCard`); header with `Upload` button → `/source-room/upload`. `source-room/upload.vue`: `UploadDropzone` + form fields `type` (select), `title`, `sourcePackId` (select existing or `newSourcePackName`), submit calls `useMaterials().upload` then redirects to material or pack. `source-room/[id].vue`: pack detail — header with name/description, items list with `MaterialCard` + drag reorder (calls `reorder`), add-materials modal (list available materials with checkboxes → `addItems`).

- [ ] **Step 5: Add sidebar navigation entry**

Modify `apps/web/components/layout/Sidebar.vue` or navigation config to add `Source Room` entry (icon `folder` or `archive`) linking to `/source-room`.

- [ ] **Step 6: Manual verification**

Run: `pnpm --filter @kantorku/web dev` and `pnpm --filter @kantorku/api dev`, navigate to `/source-room`, upload a PNG, verify classification badge appears, create pack, add material, reorder, check network tab for correct API calls and envelopes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/pages/source-room/ apps/web/components/source-room/ apps/web/composables/useMaterials.ts apps/web/composables/useSourcePacks.ts apps/web/components/layout/Sidebar.vue
git commit -m "feat(web): minimal Source Room UI (upload, packs, materials grid)"
```

---

### Task 9: E2E Tests + Seed + Wiring Verification

**Files:**
- Create: `apps/api/src/modules/materials/__tests__/e2e.materials.test.ts`
- Modify: `apps/api/src/db/seed.ts` (add demo materials + pack if needed, or keep minimal)
- Modify: `apps/api/src/app.ts` (verify all Phase 3 plugins registered, storage factory wired)

**Interfaces:**
- Consumes: All Phase 3 services/routes; `buildApp` test helper (fake DB); `createStorageAdapter` with temp dir

- [ ] **Step 1: Write failing E2E test `e2e.materials.test.ts`**

```ts
describe('E2E Materials flow', () => {
  it('upload → classify → pack → extract → content project (transform mode)', async () => {
    // 1. POST /materials/upload (multipart png) → 200, material.id, classification.userDeclared
    // 2. POST /materials/:id/classify (mocked gateway → chart) → classification.aiVerified==='chart'
    // 3. POST /source-packs {name, materialIds:[id]} → 201, items.length 1
    // 4. POST /materials/:id/extract {type:'chart'} (mocked → BTC, 4H, RSI) → metadata.extraction.instrument==='BTCUSDT'
    // 5. POST /content-projects {sourcePackId, mode:'transform', brief:'test'} → 201, project.mode==='transform'
    // 6. GET /source-packs/:id → items with materials including metadata
  });
  it('analyze mode separates ai_analysis from creator_material', async () => { /* mode:'analyze' → execution.input provenance preserved */ });
  it('dedup: same file twice reuses file_asset', async () => { /* Review Focus #1 */ });
  it('oversized/disallowed rejected before storage', async () => { /* Review Focus #2 */ });
  it('signed URL expires', async () => { /* Review Focus #5: url contains expires, after expiry 401 */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/e2e.materials.test.ts`
Expected: FAIL — until all prior tasks wired

- [ ] **Step 3: Verify wiring in `app.ts`**

Ensure `app.ts` instantiates: `storage = createStorageAdapter(config)`, `materialsService = new MaterialsService({db, storage, logger, config})`, `classificationService = new ClassificationService({db, agentService, storage, logger})`, `sourcePacksService`, `extractionService`, `contentProjectsService`; registers `materialsRoutes`, `sourcePacksRoutes`, `projectsRoutes`; handles `@fastify/multipart` registration once. Verify `createStorageAdapter` handles missing `STORAGE_BUCKET` gracefully when `STORAGE_DRIVER=local` (no S3 required for local dev).

- [ ] **Step 4: Update `seed.ts` if needed**

Optionally seed demo `source_pack` with sample materials for manual QA; keep idempotent via `onConflictDoNothing` or skip if E2E covers wiring. At minimum ensure `seed` still runs without error after schema changes: `pnpm --filter @kantorku/api db:seed` succeeds.

- [ ] **Step 5: Run full verification**

Run: `pnpm --filter @kantorku/api db:migrate` (when DB reachable), `pnpm --filter @kantorku/api db:seed`, `pnpm typecheck`, `pnpm lint` (ignore pre-existing `test-fastify.cjs` if still present), `pnpm test`, `pnpm --filter @kantorku/api build`
Expected: All pass; 96 existing tests + new Phase 3 tests green.

- [ ] **Step 6: Manual curl check (when API running)**

```bash
# login, upload, classify, pack, extract
curl -X POST http://localhost:4000/api/materials/upload -H "Authorization: Bearer $JWT" -F "file=@sample.png" -F "type=chart" | jq
curl http://localhost:4000/api/materials -H "Authorization: Bearer $JWT" | jq
curl -X POST http://localhost:4000/api/source-packs -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"name":"My Pack","materialIds":["..."]}' | jq
curl -X POST http://localhost:4000/api/materials/:id/extract -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"type":"chart"}' | jq
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/materials/__tests__/e2e.materials.test.ts apps/api/src/db/seed.ts apps/api/src/app.ts
git commit -m "test(e2e): source room happy path + review focus cases"
```

---

## Self-Review (pre-save checks)

- [x] **Spec coverage:** Every spec section has a task — §4 data model → T1, §5 storage → T2, §6 upload → T3, §7 classification → T4, §8 packs → T5, §9 extraction → T6, §10 modes → T7, §11 routes → T3+T5+T7, §12 errors → T1, §14 testing → T9, §15 deps → T2
- [x] **Step scan:** Each step names exact file, signature, and assertion; no vague "handle edge cases"
- [x] **Type consistency:** `StorageAdapter`, `MaterialsService`, `ClassificationService`, `SourcePacksService`, `ExtractionService`, `ContentProjectsService` signatures consistent across tasks; `MaterialType` enum reused
- [x] **Review Focus:** 5 cases each pinned to owning task (T3/T3/T4/T5/T2) and E2E re-covered in T9
- [x] **Proportion:** Plan ~40% longer than spec — appropriate for 9 tasks with tests; no code bodies beyond signatures/assertions

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-10-06-phase3-creator-material-source-room-plan.md`. Please review.

Which execution approach would you prefer?

- **Subagent-driven** — Fresh subagent per task + reviewer per task, then whole-branch review. Most thorough; costs fresh context per task/review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the whole branch. Cheapest and fastest.

**For this plan I recommend Subagent-driven**, because tasks have sequential dependencies (T1 schema → T2 storage → T3 upload → T4 classification → T5 packs → T6 extraction → T7 modes) and storage/upload security mistakes are costly — per-task review gates catch interface drift early.

Does the plan capture what you want, and which approach should we use?
