# Task 3 Report — Tool Registry (web_search + fetch_url)

**Date:** 2026-10-06  
**Task:** Task 3 — Tool Registry (`web_search` + `fetch_url`)  
**Plan:** `docs/superpowers/plans/2026-10-06-phase2-agent-runtime-plan.md` Task 3  
**Spec:** `docs/superpowers/specs/2026-10-06-phase2-agent-runtime-design.md` §7  

## Summary
Implemented `ToolRegistry` and two tool handlers per exact interfaces in Task 3, with strict TS, Zod validation at boundaries, no `any`, `AppError` helpers, private-IP blocking via regex, and timeout/byte guards.

## Files Created
- `apps/api/src/modules/tools/registry.ts` — `ToolRegistry` class with `register`, `get`, `getMany`, `execute` (validates input via `inputSchema.parse`, calls handler, validates output, measures latency, throws `validationError` / rethrows `AppError`, wraps unknown as `SYSTEM_ERROR`).
- `apps/api/src/modules/tools/tools/webSearch.tool.ts` — `web_search` tool per Spec §7: input `{ query, count }` (`count` default 5, max 10), output `{ results: { title, url, snippet }[] }`, deterministic mock when `SEARCH_PROVIDER` not set (never fabricates beyond mock pattern).
- `apps/api/src/modules/tools/tools/fetchUrl.tool.ts` — `fetch_url` tool per Spec §7: input `{ url }`, output `{ url, statusCode, contentType, excerpt }`, validates `https:` only, blocks private IPs via regex (`localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `0.0.0.0`, `169.254.*`, `::1`), 10 s timeout via `AbortController`, 1 MB max bytes, excerpt 2000 chars, throws `validationError` for blocked URLs and `timeoutError` on abort, `createFetchUrlTool(opts)` for injectable `fetchImpl`/`timeoutMs`/`maxBytes` plus `fetchUrlTool` singleton.
- `apps/api/src/modules/tools/registry.test.ts` — 6 tests (covers plan's 5 required + excerpt shape verification).

## Interfaces (exactly per Task 3)
```ts
interface ToolDefinition { name: string; description: string; inputSchema: z.ZodTypeAny; outputSchema: z.ZodTypeAny }
interface ToolHandler { definition: ToolDefinition; execute(input: unknown, ctx: AgentContext): Promise<unknown> }
class ToolRegistry { register(h: ToolHandler): void; get(name: string): ToolHandler | undefined; getMany(names: string[]): ToolDefinition[]; execute(name: string, input: unknown, ctx: AgentContext): Promise<{ output: unknown; latencyMs: number }> }
type AgentContext = { correlationId: string; workflowExecutionId?: string; stepId?: string; userId?: string; attempt?: number }
```

## Test Results
```
pnpm --filter @kantorku/api test -- src/modules/tools -v  →  PASS
  ✓ getMany returns only allowed tools
  ✓ execute validates input and returns output
  ✓ execute throws VALIDATION_ERROR on bad input
  ✓ fetch_url blocks private IPs and enforces max bytes
  ✓ fetch_url times out after 10s (injectable timeout)
  ✓ fetch_url truncates excerpt to 2000 chars and respects max bytes, and returns expected shape
  Test Files  1 passed (1) | Tests  6 passed (6)

pnpm --filter @kantorku/api typecheck  →  PASS (no errors)
```

## Decisions & Constraints
- **Strict TS:** no `any`; typed errors via `AppError` helpers (`notFound`, `validationError`, `timeoutError`) from `@kantorku/shared`.
- **Zod at boundaries:** both input and output validated via `parse`; `ZodError` mapped to `VALIDATION_ERROR` with `issues` in `details`.
- **Private IP blocking:** regex-based (spec requirement), checked before `fetch`; `http:` rejected separately.
- **Timeout/max-bytes:** `AbortController` with `setTimeout(timeoutMs)`; `arrayBuffer` read capped to `MAX_BYTES` before UTF-8 decode; excerpt capped to 2000 chars.
- **No fabrication:** `web_search` returns deterministic mock pattern only; real provider behind env would be injected as adapter (not needed for Phase 2).
- **Testability:** `createFetchUrlTool` exposes injectable `fetchImpl`/`timeoutMs` to avoid 10 s real waits in tests (50 ms in timeout test).

## Verification
- Ran `pnpm --filter @kantorku/api test -- src/modules/tools -v` — 6/6 pass.
- Ran `pnpm --filter @kantorku/api typecheck` — 0 errors.
- Interfaces match plan Task 3 verbatim; no scope creep.

## Next Step
Commit per Task 3 Step 7:
```bash
git add apps/api/src/modules/tools/
git commit -m "feat(tools): ToolRegistry with web_search and fetch_url"
```
