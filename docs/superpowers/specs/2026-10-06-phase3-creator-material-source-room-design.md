# Phase 3 — Creator Material / Source Room Design Spec

**Date:** 2026-10-06
**Status:** Draft for Review
**Depends on:** Phase 2 (Agent Runtime + 9Router) complete

---

## 1. Purpose & Scope

Build the **Source Room** — the intake subsystem where the creator uploads materials (charts, trade screenshots, text notes, news, promo assets, logos, documents), they are classified, grouped into **Source Packs** with full provenance, and made available to content/analysis agents in two processing modes:

- **Transform My Analysis** — creator's thesis is primary; AI organizes/clarifies without replacing
- **Analyze My Charts** — AI provides independent analysis, clearly labeled separate from creator's intent

---

## 2. Key Principles (from PRD §8, AGENTS.md §5)

| Principle | Enforcement |
|-----------|-------------|
| **Creator Source Priority** | User material never silently replaced; AI may summarize/transform but thesis preserved |
| **Provenance** | Every material/insight traceable to originating file + upload event |
| **Source Pack** | Logical grouping; one pack → multiple content projects |
| **Two Modes** | Mode chosen at content project creation (not at pack creation) |
| **Chart/Timeframe** | Relationship between chart/timeframe and extracted insight preserved |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOURCE ROOM                              │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│   Upload    │  Classify   │ Source Pack │   Material Agents     │
│  (API+UI)   │  (Heuristic │  (Grouping) │  (Extraction/Analyze) │
│             │   + AI)     │             │                       │
└──────┬──────┴──────┬──────┴──────┬─────┴───────────┬─────────────┘
       │             │             │                 │
       ▼             ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Local FS   │  │   S3/MinIO  │  │  PostgreSQL │             │
│  │  (dev)      │  │  (prod)     │  │  (metadata) │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
1. **Storage Adapter** — `STORAGE_DRIVER=local|s3`, unified interface
2. **Upload API** — multipart, validation, checksum, safe key generation
3. **Classification Service** — user-selected type + AI verification via 9Router
4. **Source Pack Service** — CRUD + join table, idempotent
5. **Material Extraction Agents** — vision-enabled agents for chart metadata, OCR, content extraction
6. **API Routes** — `/api/materials`, `/api/source-packs`, `/api/materials/:id/analyze`

---

## 4. Data Model (DATA-MODEL.md §3)

### 4.1 Tables to Create

#### `file_assets` — Physical storage metadata
```sql
id              uuid PK
storageDriver   varchar(20) NOT NULL  -- 'local' | 's3'
bucket          varchar(255)
key             varchar(500) NOT NULL -- storage path/key
originalName    varchar(500) NOT NULL
mimeType        varchar(100) NOT NULL
sizeBytes       bigint NOT NULL
checksum        varchar(64) NOT NULL  -- SHA-256 hex
uploadedBy      uuid REFERENCES users(id)
createdAt       timestamptz DEFAULT now()
```

#### `creator_materials` — User-provided assets with metadata
```sql
id              uuid PK
type            varchar(50) NOT NULL  -- enum: chart, trade_screenshot, text_note, news, promo_asset, logo, document
title           varchar(500)
fileAssetId     uuid REFERENCES file_assets(id)
metadata        jsonb                  -- extracted: instrument, timeframe, indicators, ocrText, etc.
classification  jsonb                  -- { userDeclared, aiVerified, confidence, verifiedAt }
provenance      jsonb                  -- { sourceUrl, originalContext, uploadIp, userAgent }
createdAt       timestamptz DEFAULT now()
updatedAt       timestamptz DEFAULT now()
```

#### `source_packs` — Logical grouping
```sql
id              uuid PK
name            varchar(500) NOT NULL
description     text
createdBy       uuid REFERENCES users(id)
createdAt       timestamptz DEFAULT now()
updatedAt       timestamptz DEFAULT now()
```

#### `source_pack_items` — Many-to-many with ordering
```sql
id              uuid PK
sourcePackId    uuid REFERENCES source_packs(id) ON DELETE CASCADE
materialId      uuid REFERENCES creator_materials(id) ON DELETE CASCADE
sortOrder       integer NOT NULL DEFAULT 0
notes           text                    -- user notes on this item in this pack
createdAt       timestamptz DEFAULT now()
```

**Indexes:**
- `file_assets_checksum_unique` (checksum) — dedup
- `creator_materials_type_idx` (type)
- `creator_materials_uploaded_by_idx` (uploadedBy via file_assets)
- `source_packs_created_by_idx` (createdBy)
- `source_pack_items_pack_idx` (sourcePackId)
- `source_pack_items_material_idx` (materialId)
- Unique: `(sourcePackId, materialId)` — no duplicate items in pack

---

## 5. Storage Adapter Interface

```typescript
// apps/api/src/modules/materials/storage/adapter.ts
export interface StorageAdapter {
  // Save file, return { key, checksum, sizeBytes }
  save(file: Buffer, opts: { originalName: string; mimeType: string; userId: string }): Promise<SaveResult>;
  
  // Get signed URL for access (ttlSeconds default 3600)
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  
  // Delete file
  delete(key: string): Promise<void>;
  
  // Check existence
  exists(key: string): Promise<boolean>;
}

export interface SaveResult {
  key: string;
  checksum: string;
  sizeBytes: number;
}
```

**Implementations:**
- `LocalStorageAdapter` — writes to `STORAGE_LOCAL_DIR/{userId}/{uuid}/{safeName}`, serves via signed API route
- `S3StorageAdapter` — uses `@aws-sdk/client-s3`, presigned URLs, bucket `STORAGE_BUCKET`

**Factory:** `createStorageAdapter(config): StorageAdapter` — reads `STORAGE_DRIVER`

---

## 6. Upload Flow

```
POST /api/materials/upload
  multipart/form-data:
    - file (required)
    - type (optional) — user-declared type
    - title (optional)
    - sourcePackId (optional) — add to existing pack
    - newSourcePackName (optional) — create new pack
```

**Validation (before storage):**
1. MIME allowlist: `image/*`, `application/pdf`, `text/*`, `application/json`
2. Extension allowlist: `.png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.json`
3. Size limit: `MAX_UPLOAD_MB` (default 25MB)
4. Magic bytes verification (basic)
5. Filename sanitization

**Response:**
```json
{
  "success": true,
  "data": {
    "material": { id, type, title, fileAsset: { key, url, mimeType, sizeBytes }, classification, createdAt },
    "sourcePack": { id, name } | null
  }
}
```

---

## 7. Classification Service

### 7.1 Material Types (enum)
```typescript
export type MaterialType =
  | 'chart'
  | 'trade_screenshot'
  | 'text_note'
  | 'news'
  | 'promo_asset'
  | 'logo'
  | 'document';
```

### 7.2 Classification Flow
```
User Upload
    │
    ▼
User declares type (optional) ───▶ Store as classification.userDeclared
    │
    ▼
AI Verification (async, via 9Router vision model)
    │
    ├── If userDeclared provided: verify match → classification.aiVerified = userDeclared, confidence
    ├── If no userDeclared: predict type → classification.aiVerified = predicted, confidence
    │
    ▼
Persist classification { userDeclared, aiVerified, confidence, verifiedAt }
```

**AI Verification Agent** — new agent `material-classifier@1.0.0`:
- Input: `{ fileUrl, mimeType, userDeclaredType? }`
- Output: `{ type: MaterialType, confidence: number, reasoning: string }`
- Uses `low-classification-v1` policy (vision-capable)
- Registered in Phase 2 agent registry

---

## 8. Source Pack Operations

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| Create | `POST /api/source-packs` | `{ name, description, materialIds[] }` |
| List | `GET /api/source-packs` | pagination, filter by creator |
| Get | `GET /api/source-packs/:id` | includes items with materials |
| Update | `PATCH /api/source-packs/:id` | name, description |
| Add Items | `POST /api/source-packs/:id/items` | `{ materialIds[], sortOrder? }` |
| Remove Item | `DELETE /api/source-packs/:id/items/:materialId` | |
| Reorder | `PATCH /api/source-packs/:id/items/reorder` | `{ materialId, sortOrder }[]` |
| Delete | `DELETE /api/source-packs/:id` | cascade removes items, not materials |

---

## 9. Material Extraction Agents

Three new agents (Phase 2 pattern: extend `BaseAgent`, register in registry):

### 9.1 `chart-metadata-extractor@1.0.0`
- **Input:** `{ fileUrl, mimeType }`
- **Output:** `{ instrument?, timeframe?, indicators[], priceLevels[], chartType?, confidence }`
- **Policy:** `research` (vision-capable model preferred)
- **Tools:** `fetch_url` (to download image)

### 9.2 `text-content-extractor@1.0.0`
- **Input:** `{ fileUrl, mimeType }`
- **Output:** `{ extractedText, language?, structure?, entities[] }`
- **Policy:** `research`
- **Tools:** `fetch_url`

### 9.3 `trade-data-parser@1.0.0`
- **Input:** `{ fileUrl, mimeType, extractedText? }`
- **Output:** `{ trades: [{ instrument, direction, entry, exit, sl, tp, timeframe, result, openedAt, closedAt, notes }] }`
- **Policy:** `strategy`
- **Tools:** `fetch_url`

**Extraction Trigger:** Automatic on upload for `chart`, `trade_screenshot`, `document` types; manual via `POST /api/materials/:id/extract`

---

## 10. Processing Modes (at Content Project Creation)

```
Source Pack Ready
       │
       ▼
┌──────────────────────────────────────┐
│  Create Content Project              │
│  POST /api/content-projects          │
│  { sourcePackId, mode, brief? }      │
└──────────────┬───────────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
Transform My        Analyze My
Analysis            Charts
```

### 10.1 Transform My Analysis
- **Agent:** `content-strategist` + `copywriter` (existing)
- **Input:** Source Pack materials + creator's explicit notes/thesis
- **Rule:** AI must preserve creator's core thesis; may restructure/clarify
- **Output Label:** `creator_thesis` fields tagged, AI additions marked

### 10.2 Analyze My Charts
- **Agent:** New `chart-analyst@1.0.0` + `market-outlook-agent`
- **Input:** Extracted chart metadata + market context
- **Rule:** Independent AI analysis, clearly separated from creator material
- **Output Label:** `ai_analysis` vs `creator_material` in all outputs

---

## 11. API Routes Summary

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/materials/upload` | POST | ✅ | Upload file, create material |
| `/api/materials` | GET | ✅ | List materials (paginated, filter by type, pack) |
| `/api/materials/:id` | GET | ✅ | Get material with file URL |
| `/api/materials/:id` | PATCH | ✅ | Update title, type, metadata |
| `/api/materials/:id` | DELETE | ✅ | Delete material + file asset |
| `/api/materials/:id/extract` | POST | ✅ | Trigger extraction agents |
| `/api/materials/:id/analyze` | POST | ✅ | Run Analyze My Charts mode |
| `/api/source-packs` | GET | ✅ | List packs |
| `/api/source-packs` | POST | ✅ | Create pack |
| `/api/source-packs/:id` | GET | ✅ | Get pack with items |
| `/api/source-packs/:id` | PATCH | ✅ | Update pack |
| `/api/source-packs/:id` | DELETE | ✅ | Delete pack |
| `/api/source-packs/:id/items` | POST | ✅ | Add materials to pack |
| `/api/source-packs/:id/items/:materialId` | DELETE | ✅ | Remove material from pack |
| `/api/source-packs/:id/items/reorder` | PATCH | ✅ | Reorder items |

---

## 12. Error Codes (extend `packages/shared/src/errors.ts`)

| Code | HTTP | When |
|------|------|------|
| `FILE_TOO_LARGE` | 413 | Size > `MAX_UPLOAD_MB` |
| `INVALID_FILE_TYPE` | 415 | MIME/extension not allowed |
| `STORAGE_ERROR` | 500 | Adapter save/delete failed |
| `CHECKSUM_MISMATCH` | 400 | Uploaded file checksum mismatch |
| `MATERIAL_NOT_FOUND` | 404 | Material ID not found |
| `SOURCE_PACK_NOT_FOUND` | 404 | Pack ID not found |
| `EXTRACTION_FAILED` | 500 | Extraction agent error |

---

## 13. Security & Privacy (AGENTS.md §7)

- **Private by default** — materials scoped to uploading user
- **Signed URLs** — time-limited (1hr), no direct public access
- **Sanitization** — filename, MIME validation, magic bytes check
- **Checksum dedup** — prevent duplicate storage
- **No secrets in logs** — only correlationId, materialId, userId at debug level

---

## 14. Testing Requirements

| Test Type | Coverage |
|-----------|----------|
| Unit | Storage adapters (local/S3 mock), classification logic, pack CRUD |
| Integration | Upload flow, signed URL generation, pack operations, extraction trigger |
| E2E | Upload → classify → pack → extract → content project (both modes) |
| Vision | Chart metadata extraction accuracy (golden images) |

---

## 15. Dependencies to Add

```json
// apps/api/package.json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x",
    "@aws-sdk/s3-request-presigner": "^3.x",
    "multer": "^1.x",
    "crypto": "builtin"
  },
  "devDependencies": {
    "@types/multer": "^1.x"
  }
}
```

---

## 16. Implementation Phasing (for Writing Plans)

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| 3A | DB Migration + Types + Error Codes | Tables, enums, errors |
| 3B | Storage Adapter (Local + S3) | `createStorageAdapter`, save/getSignedUrl/delete |
| 3C | Upload API + Validation | `/api/materials/upload`, multer, validation |
| 3D | Classification Service + Agent | AI verification agent, classification flow |
| 3E | Source Pack CRUD | Pack + items API |
| 3F | Extraction Agents (3) | Chart, text, trade parsers |
| 3G | Processing Modes Integration | Content project creation with mode |
| 3H | Minimal Source Room UI | Drag-drop upload, pack list, material grid |
| 3I | E2E Tests + Seed | Full flow verification |

---

## 17. Open Questions for Implementation

1. **Dedup strategy** — checksum-based: skip upload if exists, return existing material? Or always create new material referencing same file_asset?
2. **Extraction async vs sync** — Phase 3: sync (wait for extraction) or async (return material, poll status)?
3. **UI framework** — Phase 3 minimal UI in existing Nuxt app (new pages under `/source-room`)?
4. **Vision model availability** — 9Router catalog needs vision-capable models added to `routingPolicy.ts`

---

*End of Design Spec. Ready for review before writing implementation plan.*