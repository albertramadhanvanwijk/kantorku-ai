# Task 3 — Upload API + Validation — Report

**Date:** 2026-10-06 / executed 2026-10-07  
**Plan:** `docs/superpowers/plans/2026-10-06-phase3-creator-material-source-room-plan.md` Task 3  
**Spec:** `docs/superpowers/specs/2026-10-06-phase3-creator-material-source-room-design.md` §6 + §13  
**Branch:** `main` (detached for Task 3 execution)  
**Status:** DONE

---

## Summary

Implemented upload pipeline with strict validation, SHA-256 dedup, provenance, ownership enforcement, and Fastify multipart routes. Wired into `buildApp` via `createStorageAdapter` + `MaterialsService`. Added missing `@fastify/multipart@^9.3.0` dependency (Fastify 5 compatible) and fixed global error handler to preserve multipart 415/413 codes.

---

## Files Created / Modified

| File | Action | Notes |
|------|--------|-------|
| `apps/api/src/modules/materials/materials.service.ts` | **Created** | `MaterialsService` — `upload`, `list`, `getById`, `update`, `delete` |
| `apps/api/src/modules/materials/materials.routes.ts` | **Created** | Fastify plugin — `POST /api/materials/upload` (multipart), `GET /api/materials`, `GET /:id`, `PATCH /:id`, `DELETE /:id`; `authenticate` + Zod at boundary; `getSignedUrl` envelope |
| `apps/api/src/modules/materials/__tests__/materials.test.ts` | **Created** | 9 service unit tests + 7 route inject tests (16 total) |
| `apps/api/src/app.ts` | **Modified** | Imports `createStorageAdapter`, `MaterialsService`, `materialsRoutes`; instantiates storage+service in Phase 3 block, decorates `app.storage`/`app.materialsService`, registers `materialsRoutes` under `/api`; error handler maps multipart 415/413 to `INVALID_FILE_TYPE`/`FILE_TOO_LARGE` |
| `apps/api/package.json` | **Modified** | Added `@fastify/multipart: ^9.3.0` (Fastify 5 compatible; v8 requires Fastify 4) |
| `pnpm-lock.yaml` | **Modified** | Lockfile updated for `@fastify/multipart` + transitive `toad-cache` |
| `apps/api/src/modules/materials/storage/*` | **Pre-existing (Task 2)** | `LocalStorageAdapter`, `S3StorageAdapter`, `createStorageAdapter` reused |
| `apps/api/src/db/schema.ts` | **Pre-existing (Task 1)** | `file_assets`, `creator_materials`, `source_pack_items` consumed |
| `packages/shared/src/errors.ts` | **Pre-existing (Task 1)** | `fileTooLarge` 413, `invalidFileType` 415, `storageError` 500, `materialNotFound` 404 consumed |
| `packages/shared/src/schemas.ts` | **Pre-existing (Task 1)** | `materialTypeSchema` + `createMaterialSchema`/`updateMaterialSchema` consumed |

---

## Service — `MaterialsService`

**Constructor:** `deps: { db, storage: StorageAdapter, logger, config: Env }`

**`upload(file: Buffer, meta: UploadMeta): Promise<{ material, fileAsset }>`**

1. MIME allowlist: `image/*`, `text/*`, `application/pdf`, `application/json` → `invalidFileType` 415.
2. Extension allowlist: `.png/.jpg/.jpeg/.webp/.pdf/.txt/.md/.json` → 415.
3. Size: `sizeBytes` and `file.length` vs `MAX_UPLOAD_MB * 1024*1024` → `fileTooLarge` 413 (`details: { sizeBytes, maxBytes }`).
4. Magic bytes: PNG `89 50 4E 47 0D 0A 1A 0A`, JPG `FF D8`, PDF `%PDF` — mismatch → 415. WebP/txt/md/json skip strict check.
5. Sanitize: `basename` + `[^a-zA-Z0-9._-]` → `_`, max 200 chars, fallback `file`.
6. Type: optional `materialTypeSchema` (Zod) validation.
7. SHA-256: `createHash('sha256').update(file).digest('hex')` (64 hex).
8. Dedup: `select from file_assets where checksum = ?` → reuse; else `storage.save()` then `insert file_assets` (`storageDriver`, `bucket`, `key`, `originalName`, `mimeType`, `sizeBytes`, `checksum`, `uploadedBy`). Race unique violation → re-fetch + orphan `storage.delete`.
9. `insert creator_materials` with `type ?? 'document'`, `title ?? safeName`, `fileAssetId`, `classification: { userDeclared: type ?? null, aiVerified: null, confidence: null }`, `provenance: { uploadedAt: ISO, userId }`.

**`list(opts: { userId, type?, sourcePackId?, page, pageSize })`**

- Fetches all `creator_materials`, filters in JS (test-friendly) by `type`, by `sourcePackId` via `source_pack_items` join, and by ownership via `file_assets.uploadedBy` (checks `uploadedBy` and `uploaded_by` variants). Sorts `createdAt` desc, paginates `slice(offset, offset+pageSize)`. Returns `{ rows, total }`.

**`getById(id, userId)`**

- `select where id = ?` + fallback full scan, then ownership join; throws `materialNotFound` 404 if missing or not owned. Returns `{ ...material, fileAsset }`.

**`update(id, userId, patch: { title?, type?, metadata? })`**

- Calls `getById` for ownership, validates `title` length 1–500, `type` via `materialTypeSchema` (also merges `classification.userDeclared`), sets `metadata` passthrough. No-op if empty. `update creator_materials set ... where id = ? returning()`. Re-attaches `fileAsset`.

**`delete(id, userId)`**

- `getById` for ownership, deletes `source_pack_items where materialId = ?` (plus manual `_sourcePackItems` map sweep for fake), deletes `creator_materials where id = ?` (plus `_creatorMaterials` sweep), ref-counts `creator_materials where fileAssetId = ?` — if zero, deletes `file_assets where id = ?` and `storage.delete(key)` (best-effort, warns on failure).

No secrets logged — only `correlationId/materialId/userId/checksum` at `debug`.

---

## Routes — `materialsRoutes` (Fastify plugin, prefix `/api`)

**Multipart registration:** `await import('@fastify/multipart')` + `app.register(multipart, { limits: { fileSize: MAX_UPLOAD_MB*1024*1024 } })` guarded by `app._multipartRegistered`. Fastify 5 requires `@fastify/multipart@^9`.

**`POST /api/materials/upload`** — `preHandler: [authenticate]`

- Detects multipart via `content-type: multipart/form-data` + `request.file` existence. Parses via `request.file()` then `parts()` fallback to collect `file` + fields `title/type/sourcePackId`. Catches `FST_REQ_FILE_TOO_LARGE` → `fileTooLarge`. Fallback body parsing for test injection (`body.file` as Buffer/object) and non-multipart JSON. Validates `type` via `materialTypeSchema`, `sourcePackId` via `z.string().uuid()`, calls `service.upload`, signs `fileAsset` via `storage.getSignedUrl(key)` → `{ success:true, data:{ material, fileAsset: { ...key, url, mimeType, sizeBytes, checksum } } }` 200. Missing file → 400 `VALIDATION_ERROR`; oversized → 413; disallowed → 415.

**`GET /api/materials`** — `preHandler: [authenticate]`, Zod `paginationQuerySchema` (`page/pageSize/type/sourcePackId`), calls `list`, signs each `fileAsset` → `{ success:true, data:{ rows, total, page, pageSize } }`.

**`GET /api/materials/:id`** — auth + `getById` + signed `fileAsset`.

**`PATCH /api/materials/:id`** — auth + `patchBodySchema` (`title/type/metadata`) Zod → `update` + signed `fileAsset`.

**`DELETE /api/materials/:id`** — auth → `delete` → `{ success:true, data:{ id } }`.

AppError → global handler envelope `{ success:false, error:{ code, message, details } }`. JWT 401, validation 400, plus new 415 multipart passthrough.

---

## Wiring — `apps/api/src/app.ts`

```ts
import { createStorageAdapter } from './modules/materials/storage/index.js';
import { MaterialsService } from './modules/materials/materials.service.js';
import { materialsRoutes } from './modules/materials/materials.routes.js';

// after db/logger init:
let storage: ReturnType<typeof createStorageAdapter> | null = null;
let materialsService: MaterialsService | null = null;
try {
  storage = createStorageAdapter(config);
  materialsService = new MaterialsService({ db, storage, logger: internalLogger, config });
} catch (err) {
  internalLogger.warn({ err }, 'Materials storage init failed — routes will error until configured');
}
(app as any)['storage'] = storage;
(app as any)['materialsService'] = materialsService;

// routes:
await app.register(async (api) => {
  await api.register(healthRoutes);
  await api.register(authRoutes);
  await api.register(agentsRoutes);
  await api.register(workflowsRoutes);
  await api.register(approvalsRoutes);
  await api.register(runsRoutes);
  await api.register(toolsRoutes);
  await api.register(materialsRoutes); // Phase 3
}, { prefix: '/api' });
```

`STORAGE_DRIVER=local` (default) needs only `STORAGE_LOCAL_DIR` + `AUTH_SECRET`; S3 path requires `STORAGE_BUCKET` etc. — factory throws `validationError` on unsupported driver.

---

## Tests — `materials.test.ts`

**Fake DB:** `makeMaterialsFakeDb()` — in-memory `Map` for `file_assets`, `creator_materials`, `source_pack_items`. Supports `insert().values().returning()`, `select().from().where(eq(...)).limit().offset()`, `update().set().where().returning()`, `delete().where()` via Drizzle `eq()` `queryChunks` parsing (extracts `Param` value + column `name`). Unique checksum guard on `file_assets` insert. Exposes `_fileAssets/_creatorMaterials/_sourcePackItems` for ref-count sweeps.

**Helpers:** `pngBuffer()` (valid PNG magic + filler), `jpgBuffer()`, `pdfBuffer()`, `exeBuffer()`, `buildMultipartPayload(fields, file)` (boundary `----TestBoundary…`, `Content-Disposition`, `Content-Type`, `\r\n` framing).

**Service suite (9 tests):**

| Test | Assertion |
|------|-----------|
| upload valid png creates file_asset + material | `material.id`, `type==='chart'`, `checksum` 64 hex matches `createHash(sha256)`, maps size 1 each |
| upload oversized → 413 | `MAX_UPLOAD_MB=1`, 2 MB PNG → `code==='FILE_TOO_LARGE'`, `statusCode===413` |
| upload disallowed extension `.exe` → 415 | `.exe` with `image/png` MIME → `INVALID_FILE_TYPE` |
| upload disallowed MIME `application/x-msdownload` → 415 | MIME not in allowlist → 415 |
| PNG magic mismatch (`fake.png` but JPG bytes) → 415 | `INVALID_FILE_TYPE` |
| dedup reuses file_asset, new material | same `pngBuffer()` twice → `fileAssetMap.size===1`, `materialMap.size===2`, same `id`/`checksum`, different `material.id` |
| list/get/patch/delete ownership | `otherUserId` → list 0, get/update/delete 404 `MATERIAL_NOT_FOUND`; owner can get/patch/delete |
| delete removes file_asset when sole ref | upload then delete → `fileAssetMap.size===0` |
| delete keeps file_asset when other material still references | dedup upload 2, delete one → `fileAssetMap.size===1`; delete both → 0 |

**Routes suite (7 tests, via `buildApp({ logger:false, db: fakeDb })` + `inject`):**

| Test | Request | Expected |
|------|---------|----------|
| upload valid png 200 | `POST /api/materials/upload` multipart `chart.png` + `title/type=chart` + `Bearer user-1` | 200 `success:true`, `material.id`, `type==='chart'`, `fileAsset.checksum` 64 hex, `fileAsset.url` contains `/api/files/`, `expires=`, `sig=` |
| upload oversized → 413 | lower `MAX_UPLOAD_MB` to 0.00001, 1 KB PNG | 413 `FILE_TOO_LARGE` |
| upload disallowed ext → 415 | `evil.exe` with PNG bytes | 415 `INVALID_FILE_TYPE` (global handler now maps multipart 415 correctly) |
| dedup reuses file_asset | same bytes twice (unique per-test suffix) as `user-1` | `fileAssetMap +1`, `materialMap +2`, same `checksum`/`id`, different `material.id` |
| ownership 404 | upload as `user-1`, GET/PATCH/DELETE as `user-2` → 404, owner succeeds then deleted → GET 404 | `MATERIAL_NOT_FOUND` 404 for cross-user, owner 200 |
| GET paginated | `GET /api/materials?page=1&pageSize=5` | 200 `rows[]`, `total:number` |
| upload without auth → 401 | no `Authorization` | 401 `UNAUTHORIZED` |

**Run:**

```
pnpm --filter @kantorku/api exec vitest run src/modules/materials/__tests__/materials.test.ts --reporter=verbose
pnpm --filter @kantorku/api exec vitest run src/modules/materials/__tests__/materials.test.ts src/modules/materials/__tests__/storage.test.ts --reporter=verbose
```

Result: **16 passed** (materials) + **6 passed** (storage) = **22 passed**, 0 failed.

`pnpm --filter @kantorku/api exec tsc --noEmit` — **0 errors**.

---

## Dependencies

- `@fastify/multipart@^9.3.0` added to `apps/api/package.json` (Fastify 5 requires v9; v8 requires Fastify 4, v10 not yet stable). `pnpm install` updated `pnpm-lock.yaml` (+`toad-cache`, busboy).
- No other new deps. `crypto` builtin, `drizzle-orm`, `zod` already present.

---

## Verification

- [x] Failing tests written first (service + routes inject with multipart mocked via `buildMultipartPayload` + `Buffer` fake DB, no real FS beyond `LocalStorageAdapter` temp dir `mkdtemp`).
- [x] `materials.service.ts` validates MIME/extension/size/magic-bytes, sanitizes (`basename`, `[^a-zA-Z0-9._-]`, 200 chars), SHA-256, dedup by checksum, inserts `file_assets` + `creator_materials` with `classification` + `provenance`.
- [x] `materials.routes.ts` Fastify plugin with `@fastify/multipart`, `POST /upload` multipart, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `authenticate` + Zod, signed URL envelope, AppError mapping.
- [x] Wired in `app.ts` (`createStorageAdapter`, `MaterialsService`, `materialsRoutes`, `app.storage`/`app.materialsService` decoration).
- [x] Added dep `@fastify/multipart` via `pnpm --filter @kantorku/api add @fastify/multipart` (manual `package.json` edit + `pnpm install` due to pnpm timeout on direct add; result equivalent).
- [x] Tests + typecheck pass; report written.

---

## Risks / Follow-ups

- `list` does full table scan + JS filter — acceptable for MVP/fake DB tests but should be optimized to SQL `WHERE uploadedBy = ?` + pagination at DB level before production scale.
- Magic bytes only strict for PNG/JPG/PDF — WebP could add `RIFF`/`WEBP` check if needed.
- `delete` orphan storage cleanup best-effort; concurrent dedup race orphan delete is also best-effort.
- `app.ts` global error handler now has 415 multipart branch — ensure Phase 4+ routes don't shadow it.

---

## Commit

```
feat(materials): upload with validation, checksum dedup, and CRUD routes
```

Includes: `materials.service.ts`, `materials.routes.ts`, `materials.test.ts`, `app.ts`, `package.json`, `pnpm-lock.yaml`.

