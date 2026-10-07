# Task 4 Report — Classification Service + Agent

**Date:** 2026-10-07  
**Plan:** `docs/superpowers/plans/2026-10-06-phase3-creator-material-source-room-plan.md` Task 4  
**Spec:** `docs/superpowers/specs/2026-10-06-phase3-creator-material-source-room-design.md` §7  
**Branch:** `feature/phase3-source-room` (working directory)

## Summary
Implements `material-classifier@1.0.0` vision-capable classification agent plus the `ClassificationService` that verifies/predicts material types via `AgentService.run`, persists `classification` jsonb, and integrates with the upload flow (fire-and-forget) and a manual `POST /:id/classify` route. Routing policy `low-classification-v1` confirmed and updated to include `vision`.

## Files Created
- `apps/api/src/modules/agents/prompts/materialClassifier.v1.ts` — `PROMPT_VERSION='material-classifier@1.0.0'`, `SYSTEM_PROMPT` (Creator Source Priority, 7 types, JSON-only, 1-sentence reasoning, no hallucination, confidence 0-1).
- `apps/api/src/modules/agents/agents/materialClassifier.agent.ts` — Zod input `{ fileUrl: url, mimeType: string, userDeclaredType? }`, output `{ type: materialType, confidence 0..1, reasoning }`, `Definition id='material-classifier' v1.0.0 modelPolicy='classification' allowedTools=[]`, extends `BaseAgent`, `buildMessages` = system + JSON user.
- `apps/api/src/modules/materials/classification.service.ts` — `verify(materialId, userId)` loads material+file_asset with ownership, calls `storage.getSignedUrl(key)` for `fileUrl`, forwards `mimeType` + optional `userDeclaredType` (from `classification.userDeclared` else `material.type` unless default `document`), invokes `agentService.run('material-classifier', ...)`, on success merges `{ userDeclared, aiVerified, confidence, reasoning, verifiedAt }` into `creator_materials.classification` + updates `updatedAt`, on agent failure logs warning and returns original material (never throws to break upload).
- `apps/api/src/modules/materials/__tests__/classification.test.ts` — 7 tests (5 unit + 2 route), all mocked gateway.

## Files Modified
- `apps/api/src/modules/agents/agents/index.ts` — add `materialClassifierDefinition` to `ALL_AGENT_DEFINITIONS` and register factory `material-classifier -> MaterialClassifierAgent` in `registerConcreteAgents`; re-export via `export * from './materialClassifier.agent.js'`.
- `apps/api/src/modules/gateway/routingPolicy.ts` — `low-classification-v1.capabilities` extended with `vision` (`['structured-output','function-calling','vision']`).
- `apps/api/src/modules/materials/materials.service.ts` — added `ClassificationServiceLike`, optional `classificationService` dep (+ `setClassificationService`), fire-and-forget `void classificationService.verify(id,userId).catch(log)` after successful `upload` insert.
- `apps/api/src/modules/materials/materials.routes.ts` — added `POST /api/materials/:id/classify` (auth, ownership, calls `classificationService.verify`, returns signed `fileAsset` when present; graceful fallback when service not configured).
- `apps/api/src/app.ts` — instantiate `ClassificationService` after `storage`/`agentService`, pass into `MaterialsService`, decorate `app.classificationService`.

## Tests — Step 7 (verify they pass)
```
pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/classification.test.ts
  7 passed

pnpm --filter @kantorku/api test
  Test Files 18 passed, Tests 129 passed (includes 7 new classification tests)
```

New tests:
1. `verify with userDeclared chart returns aiVerified=chart with confidence` — asserts persisted `classification.aiVerified='chart'`, `confidence~0.92`, `reasoning`, `verifiedAt`, `userDeclared='chart'`, and agent input includes `userDeclaredType`.
2. `verify without userDeclared predicts type from image` — no type on upload -> `userDeclared=null`; agent returns `trade_screenshot` without `userDeclaredType` in input.
3. `verify updates classification jsonb and persists` — round-trips via `getById`.
4. `verify does not throw on agent failure (best-effort)` — error path returns original, logs warn.
5. `upload fire-and-forget does not break upload when classification fails` — upload succeeds, aiVerified stays null.
6. `POST /:id/classify returns updated classification (200)` — inject flow: multipart upload then classify, checks 200 and agent call with correlationId.
7. `POST /:id/classify enforces ownership (404)` — other user gets `MATERIAL_NOT_FOUND`.

## Typecheck
```
pnpm --filter @kantorku/api typecheck
  tsc --noEmit  ✔ (no errors)
```
Strict TS, Zod schemas, no `any` in public contracts (internal fake DB uses `any` only in tests, matching existing pattern).

## Constraints Met
- Mock gateway in tests (no real 9Router).
- Classification never throws to break upload (best-effort; background verify swallowed, manual route surfaces `MATERIAL_NOT_FOUND` for ownership but not agent failures).
- `routingPolicy` vision-capability confirmed and added to `low-classification-v1`.

## How to Run (Task 4 only)
```bash
pnpm --filter @kantorku/api typecheck
pnpm --filter @kantorku/api test -- src/modules/materials/__tests__/classification.test.ts
```

## Deferred
- Git commit not performed per project instruction to keep working-directory changes for review before committing (all files staged are listed above). Run `git add` + commit when ready.

## Acceptance Criteria
- [x] Prompt v1 with required fields and Creator Source Priority
- [x] Agent extends BaseAgent, Definition correct, registered in `ALL_AGENT_DEFINITIONS`
- [x] `routingPolicy` vision-capable
- [x] `classification.service.ts` implements verify with signed URL + agent + jsonb persist
- [x] Fire-and-forget wired into `materials.service.ts` upload
- [x] `POST /:id/classify` route added to `materials.routes.ts`
- [x] Failing tests written first, now 7/7 pass; full suite 129/129 pass
- [x] typecheck passes
