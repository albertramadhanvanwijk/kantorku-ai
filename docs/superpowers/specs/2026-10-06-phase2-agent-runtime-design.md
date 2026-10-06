# Phase 2 — Agent Runtime + 9Router — Design Spec

**Date:** 2026-10-06
**Status:** Draft — Pending Review
**Phase:** 2 of Roadmap (Agent Runtime + 9Router)
**Author:** My_Agents (OpenCode)
**Source-of-truth priority:** AGENTS.md > PRD.md > ARCHITECTURE.md > AGENT-SPEC.md > WORKFLOWS.md > DATA-MODEL.md

---

## 1. Summary

Phase 2 delivers the AI execution layer for KantorKu-AI: a **9Router model gateway**, **agent registry + base agent lifecycle**, **structured output enforcement**, **orchestration runtime (DAG with human approval gates)**, **agent run observability**, and a **basic tool registry**.

After Phase 2, the HQ/Office shell built in Phase 1 can trigger real agent work through 9Router, persist runs, and resume workflows after approvals/failures. Three initial specialist agents (Research → Content Strategist → Copywriter) validate the end-to-end loop.

Phase 2 does NOT add content generation UI beyond an API for triggering runs, nor TikTok analytics import, nor full content workflow UI — those belong to later phases.

---

## 2. Goals

1. Call 9Router via direct HTTP from a gateway abstraction — no vendor SDK leakage into business logic (per AGENTS.md §4).
2. Policy-driven model selection (task complexity / quality / latency / cost).
3. Versioned agent definitions with input/output schemas (Zod) and prompt versioning.
4. Deterministic structured outputs validated at the agent boundary.
5. Orchestration engine that executes a DAG of agent steps, supports human approval gates, retries, and resume-from-failed-step.
6. Full auditability: every agent run records provider/model, prompt version, token usage (when available), latency, status, correlation/task ID (per AGENTS.md §4).
7. Fallback behavior on provider/model failure where safe.
8. Basic tool registry so agents can declare and invoke tools (web_search, fetch_url) without hard-coding provider specifics.
9. Persist everything needed to answer observability questions in PRD §24.

---

## 3. Non-Goals

- Full content production UI (editor, carousel preview) — Phase 3+.
- TikTok CSV import / analytics — Phase 5+.
- Knowledge Center / pgvector retrieval — later phase.
- Multi-tenant, SaaS billing, autonomous publishing — explicitly Non-Goals for MVP.
- Complex 3D office rendering.
- Trading execution.

---

## 4. Architecture

```
Nuxt Web App (HQ)
      │
      ▼
Fastify API (/api)
      │
      ├─► AgentService         ─┐
      ├─► WorkflowEngine (DAG)  ├─► NineRouterGateway ──► 9Router HTTP API
      ├─► ToolRegistry          │
      └─► RunLogger / Audit ───┘
              │
      ┌───────┴────────┐
      │                │
 PostgreSQL        Redis + BullMQ
 agents/          queue / cache /
 workflows/       rate-limit /
 runs/approvals   locks
```

### 4.1 Module Layout (apps/api/src)

```
apps/api/src/
  modules/
    gateway/
      nineRouter.gateway.ts      # HTTP client, model listing, chat/completions
      routingPolicy.ts           # taskType → model selection, fallback, budgets
      nineRouter.types.ts
    agents/
      baseAgent.ts               # abstract BaseAgent<TInput,TOutput>
      registry.ts                # in-memory + DB-backed AgentDefinition registry
      agent.service.ts           # run(), validate, log, fallback
      agents/
        research.agent.ts
        contentStrategist.agent.ts
        copywriter.agent.ts
      prompts/
        research.v1.ts
        strategist.v1.ts
        copywriter.v1.ts
    orchestration/
      workflowEngine.ts          # DAG execution, topological sort, gate handling
      workflow.service.ts        # CRUD workflow definitions, executions
      executionStore.ts         # DB access for executions/steps
    tools/
      registry.ts                # ToolDefinition, ToolHandler map
      tools/
        webSearch.tool.ts
        fetchUrl.tool.ts
    runs/
      runLogger.ts               # agent_runs, tool_runs, agent_events writes
  db/
    schema.ts                    # extended tables (see §6)
    migrate.ts
  routes/  (or modules/*/ *.routes.ts)
```

All provider-specific code lives behind `NineRouterGateway`. Business logic never imports `fetch` to 9Router directly.

---

## 5. NineRouter Gateway

### 5.1 Interface

```ts
// nineRouter.types.ts
type ModelCapability = 'reasoning' | 'structured-output' | 'vision' | 'function-calling' | 'long-context';

interface ModelSpec {
  id: string;
  name: string;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: ModelCapability[];
}

interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; name?: string }>;
  tools?: ToolDefinition[];
  responseFormat?: { type: 'json_object' | 'json_schema'; schema?: unknown };
  temperature?: number;
  maxTokens?: number;
  correlationId?: string;
}

interface ChatResponse {
  model: string;
  provider: '9router';
  content: string;               // raw string; caller parses/validates
  parsedJson?: unknown;          // when responseFormat is json_*
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd?: number };
  latencyMs: number;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
}

interface RoutingPolicy {
  taskType: string;              // e.g. 'research', 'strategy', 'copywriting', 'qa'
  preferredModels: string[];     // ordered
  fallbackModels: string[];      // ordered
  maxCostPerRunUsd?: number;
  maxLatencyMs?: number;
  requireCapabilities?: ModelCapability[];
}
```

### 5.2 NineRouterGateway Class

```ts
class NineRouterGateway {
  constructor(private config: { baseUrl: string; apiKey: string; defaultModel: string; logger: Logger }) {}
  listModels(): Promise<ModelSpec[]>;
  chat(req: ChatRequest, policy?: RoutingPolicy): Promise<ChatResponse>;
  // internals: fetch with auth header, retry with fallback model, timeout, usage extraction
}
```

- Auth: `Authorization: Bearer ${NINE_ROUTER_API_KEY}` (header name confirmed against 9Router docs at implementation time; adapter isolates change).
- Base URL from `NINE_ROUTER_BASE_URL` env; defaults documented in `packages/shared` env schema.
- `listModels()` caches for 10 minutes in Redis (or memory if Redis unavailable).
- `chat()` enforces timeout (default 60s, configurable per agent), measures latency, extracts `usage` when provider returns it, logs `correlationId`.
- On 429/5xx/timeout: retry with next fallback model once, then surface `PROVIDER_ERROR`.
- Never logs prompt content at `info` level in production; debug-level only with redaction.

### 5.3 Routing Policy

Policy is data, not code. Default policies seeded in DB or config file:

| taskType | preferred | fallback | notes |
|---|---|---|---|
| research | mid-cost reasoning | low-cost fallback | needs synthesis, source handling |
| strategy | mid-cost | low-cost | summarization + planning |
| copywriting | mid-cost | low-cost | template-aware length |
| qa / risk | stronger | mid | final review needs stronger model |
| classification | low-cost | — | cheap |

`routingPolicy.ts` exposes `selectModel(taskType, requiredCapabilities, budget) => modelId`. Budget guardrail: if projected cost > `maxCostPerRunUsd`, downgrade or reject with `BUDGET_EXCEEDED`.

---

## 6. Agent Registry & Base Agent

### 6.1 AgentDefinition (persisted)

```ts
interface AgentDefinition {
  id: string;                    // slug, e.g. "research-agent"
  name: string;                  // display
  version: string;               // semver string, e.g. "1.0.0"
  role: string;                  // from AGENT-SPEC.md
  purpose: string;
  inputSchema: ZodSchema;        // stored as JSON Schema in DB, hydrated to Zod at runtime
  outputSchema: ZodSchema;
  allowedTools: string[];        // subset of ToolRegistry keys
  systemPrompt: string;          // versioned; prompt_version = `${id}@${version}`
  modelPolicy: string;           // RoutingPolicy.taskType key
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

Table `agent_definitions` holds the JSON Schema forms plus `prompt_version`. Seeding is via migration/seed script, not manual DB edits.

### 6.2 BaseAgent

```ts
abstract class BaseAgent<TInput, TOutput> {
  abstract readonly definition: AgentDefinition;
  constructor(
    protected readonly gateway: NineRouterGateway,
    protected readonly toolRegistry: ToolRegistry,
    protected readonly logger: Logger,
  ) {}
  async run(input: TInput, ctx: AgentContext): Promise<AgentRunResult<TOutput>>;
  protected abstract buildMessages(input: TInput, ctx: AgentContext): ChatRequest['messages'];
  protected selectModel(ctx: AgentContext): string { return resolvePolicy(this.definition.modelPolicy); }
  protected getTools(): ToolDefinition[] { return this.toolRegistry.getMany(this.definition.allowedTools); }
}
```

`AgentContext` carries `correlationId`, `workflowExecutionId`, `stepId`, `userId`, `attempt`.

Flow in `BaseAgent.run()`:
1. Validate `input` against `inputSchema` (400 if invalid, typed error).
2. Build messages (system prompt + input rendering).
3. Call `gateway.chat()` with `responseFormat: { type: 'json_schema', schema: outputSchema }`.
4. Parse `content` as JSON, validate against `outputSchema`. On schema mismatch: one repair retry with corrective system message, then `VALIDATION_ERROR`.
5. Return `{ output, usage, latencyMs, model, provider }`.
6. Caller (`AgentService`) persists to `agent_runs` / `tool_runs` / `agent_events`.

### 6.3 AgentService

- `registry.list()` / `registry.get(id, version?)`
- `register(definition)` — creates new version, does not mutate prior rows (append-only per DATA-MODEL.md §12).
- `run(agentId, input, context)` — instantiates agent class, executes, logs, returns envelope.
- Enforces `allowedTools` — agent cannot call undeclared tools.

### 6.4 Initial Agents (Phase 2 scope)

**Research Agent** (AGENT-SPEC §3/4/5)
- Input: `{ query: string; maxSources?: number; recencyDays?: number }`
- Tools: `web_search`, `fetch_url`
- Output: `{ sources: Array<{ url: string; title: string; publishedAt?: string; excerpt: string }>; summary: string; confidence: 'high'|'medium'|'low'; provenance: string[] }`
- Must preserve URLs/source metadata, distinguish fact vs interpretation, note freshness.

**Content Strategist** (AGENT-SPEC §9)
- Input: `{ research: ResearchOutput; contentCategory: string; brandVoice?: unknown }`
- Output: `{ goal: string; audience: string; angle: string; hookDirections: string[]; slideStructure: Array<{ index: number; purpose: string }>; ctaStrategy: string }`

**Copywriter** (AGENT-SPEC §11)
- Input: `{ strategy: StrategistOutput; template?: unknown; tradingDna?: unknown }`
- Output: `{ slides: Array<{ index: number; headline: string; body: string }>; caption: string; hashtags: string[] }`
- Must respect Trading DNA, avoid unsupported claims, fit template constraints (enforced via schema `maxLength`).

Each agent has prompt file `prompts/<agent>.v1.ts` exporting `SYSTEM_PROMPT` string and `PROMPT_VERSION`. Prompts are not secrets and are versioned in git.

---

## 7. Tool Registry

```ts
interface ToolDefinition {
  name: string;                  // e.g. "web_search"
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
}

interface ToolHandler {
  definition: ToolDefinition;
  execute(input: unknown, ctx: AgentContext): Promise<unknown>;
}

class ToolRegistry {
  register(handler: ToolHandler): void;
  get(name: string): ToolHandler | undefined;
  getMany(names: string[]): ToolDefinition[];
  async execute(name: string, input: unknown, ctx: AgentContext): Promise<ToolRunRecord>;
}
```

Phase 2 tools:
- `web_search` — input `{ query: string; count?: number }`, output `{ results: Array<{ title; url; snippet }> }`. Implementation: pluggable search adapter; Phase 2 ships a stub/mock plus optional real provider (e.g., Tavily/Bing) behind env flag. Must not fabricate URLs.
- `fetch_url` — input `{ url: string }`, output `{ url; statusCode; contentType; excerpt: string }`. Validates URL, enforces allowlist/blocklist, timeout, max bytes.

Tool calls are logged to `tool_runs` tied to `agent_run_id`.

---

## 8. Orchestration Runtime (Full DAG)

### 8.1 Definitions

```ts
interface WorkflowDefinition {
  id: string;                    // slug, e.g. "content-production-v1"
  name: string;
  version: string;
  steps: WorkflowStep[];
  edges: Array<{ from: string; to: string }>; // DAG edges
  approvalGates: Array<{ stepId: string; type: 'script'|'visual'; required: boolean }>;
}

interface WorkflowStep {
  id: string;
  agentId: string;               // references AgentDefinition.id
  inputMapping: InputMapping;    // JSONPath-ish mapping from workflow input + prior step outputs
  outputKey: string;             // where to store this step's output in workflow state
  retryPolicy?: { maxAttempts: number; backoffMs: number };
  timeoutMs?: number;
}

type InputMapping =
  | { type: 'static'; value: unknown }
  | { type: 'fromWorkflowInput'; path: string }
  | { type: 'fromStepOutput'; stepId: string; path: string }
  | { type: 'merge'; mappings: Record<string, InputMapping> };
```

Seed workflow for Phase 2 validation: `research → strategist → copywriter` (linear chain, no approval gates yet; gates added as opt-in to prove the mechanism).

### 8.2 Execution

Tables:
- `workflow_executions` — one row per run, holds `workflow_definition_id`, `status` (`pending|running|waiting_approval|completed|failed|cancelled`), `input`, `state` (accumulated outputs keyed by `outputKey`), `error`, timestamps, `correlation_id`.
- `workflow_steps` — one row per step execution, holds `workflow_execution_id`, `step_id`, `agent_definition_id`, `status`, `attempt`, `input`, `output`, `error`, `started_at`, `completed_at`.

Engine algorithm:
1. `WorkflowEngine.execute(definitionId, input, userId)` creates `workflow_executions` row + `workflow_steps` rows (all `pending`), returns execution id immediately.
2. Enqueues BullMQ job `workflow:execute:{executionId}`.
3. Worker dequeues, topologically sorts `steps` via `edges`, iterates in order. For each step:
   - Skip if already `completed` (resume path).
   - Check in-degree: ensure all predecessors `completed`.
   - If step has `approvalGate` and predecessor just completed: set execution to `waiting_approval`, create `approvals` row, stop worker (no further steps until approved). Approval is external event (POST /api/approvals/:id/decide).
   - Otherwise: set step to `running`, call `AgentService.run()`, persist `agent_runs` linkage, on success set `completed` and continue, on retriable error retry per `retryPolicy`, on non-retriable set `failed` and mark execution `failed`.
4. When all steps `completed`: mark execution `completed`.
5. `resume(executionId)` re-enqueues from first non-completed step — idempotent per AGENTS.md §3.

BullMQ config: `attempts` from `retryPolicy`, `backoff: { type: 'exponential', delay: backoffMs }`, `removeOnComplete: 100`, `removeOnFail: 500`. Concurrency 2 initially. Redis is required for queue; if unavailable, engine falls back to in-process sequential execution with warning (same pattern as existing Redis optional handling).

### 8.3 Approvals

```ts
interface Approval {
  id: string;
  workflowExecutionId: string;
  stepId: string;
  type: 'script'|'visual';
  status: 'pending'|'approved'|'rejected';
  decidedBy?: string;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
}
```

On `approved`: engine resumes. On `rejected`: engine marks execution `failed` with `APPROVAL_REJECTED` and preserves state for revision (per WORKFLOWS.md §11). Script lock semantics are enforced by workflow definition — design steps do not run until script approval gate is `approved`.

---

## 9. Data Model — Migrations

New tables (all with `id uuid PK default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz` where mutable):

- `agent_definitions(id, slug, version, name, role, purpose, input_schema jsonb, output_schema jsonb, allowed_tools text[], system_prompt text, prompt_version varchar, model_policy varchar, config jsonb, created_at, updated_at)`
  - Unique `(slug, version)`.
  - Index on `slug`.

- `agent_runs(id, agent_definition_id uuid fk, workflow_execution_id uuid nullable fk, workflow_step_id uuid nullable fk, model_provider varchar, model_name varchar, prompt_version varchar, status varchar, input jsonb, output jsonb, usage_metadata jsonb, latency_ms int, error_metadata jsonb, correlation_id varchar, started_at timestamptz, completed_at timestamptz)`
  - Index on `agent_definition_id`, `workflow_execution_id`, `correlation_id`, `created_at`.

- `workflow_definitions(id, slug varchar unique, name varchar, version varchar, definition jsonb not null, created_at, updated_at)`
  - Unique `(slug, version)` via composite or slug+version column.

- `workflow_executions(id, workflow_definition_id uuid fk, status varchar, input jsonb, state jsonb, error jsonb, correlation_id varchar, created_by uuid nullable fk users, started_at, completed_at, created_at, updated_at)`
  - Index on `status`, `workflow_definition_id`.

- `workflow_steps(id, workflow_execution_id uuid fk, step_id varchar, agent_definition_id uuid fk, status varchar, attempt int, input jsonb, output jsonb, error jsonb, started_at, completed_at)`
  - Unique `(workflow_execution_id, step_id, attempt)` or `(workflow_execution_id, step_id)` with attempt tracking.

- `approvals(id, workflow_execution_id uuid fk, step_id varchar, type varchar, status varchar, decided_by uuid nullable fk, reason text, created_at, decided_at)`
  - Index on `workflow_execution_id`, `status`.

- `tool_runs(id, agent_run_id uuid fk, tool_name varchar, input jsonb, output jsonb, status varchar, latency_ms int, error jsonb, created_at)`
  - Index on `agent_run_id`.

- `agent_events(id, agent_run_id uuid nullable fk, workflow_execution_id uuid nullable fk, event_type varchar, payload jsonb, created_at)`
  - For timeline observability; index on `agent_run_id`, `workflow_execution_id`.

Existing `audit_events` continues for user/system actions; `agent_events` is the operational timeline per DATA-MODEL.md §10.

All migrations are additive, idempotent, and go through `apps/api/src/db/migrate.ts`. Drizzle schema updated in `schema.ts`.

---

## 10. API Design

All routes under `/api`, authenticated via existing `auth` plugin (Bearer JWT). Consistent envelope: `{ success: true, data }` / `{ success: false, error: { code, message, details } }`. Pagination where lists can grow. Validation via Zod at route boundary.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/agents | yes | List agent definitions (query: `?slug=&version=`) |
| POST | /api/agents | yes | Register new agent version (admin/owner) |
| GET | /api/agents/:id | yes | Get agent definition (id = slug or uuid) |
| POST | /api/agents/:id/run | yes | Execute agent synchronously (body: `{ input, correlationId? }`) |
| GET | /api/workflows | yes | List workflow definitions |
| POST | /api/workflows | yes | Register workflow definition |
| GET | /api/workflows/:id | yes | Get workflow definition |
| POST | /api/workflows/:id/execute | yes | Start workflow execution (body: `{ input, correlationId? }`) → 202 { executionId } |
| GET | /api/workflows/executions/:id | yes | Get execution + steps + approvals |
| GET | /api/workflows/executions | yes | List executions (paginated, filter by status/definition) |
| POST | /api/workflows/executions/:id/resume | yes | Resume from failed/approval state |
| POST | /api/approvals/:id/decide | yes | Body `{ decision: 'approved'|'rejected', reason? }` |
| GET | /api/runs | yes | Query agent_runs (paginated, filters) |
| GET | /api/runs/:id | yes | Get single agent run with tool_runs |
| GET | /api/tools | yes | List registered tools |

Synchronous `POST /api/agents/:id/run` is for debugging/low-latency use; workflow path is the primary async path via BullMQ. Both paths persist `agent_runs`.

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `PROVIDER_ERROR`, `BUDGET_EXCEEDED`, `TIMEOUT`, `APPROVAL_REQUIRED`, `SYSTEM_ERROR` (per DEVELOPMENT-RULES.md §12).

---

## 11. Structured Outputs

- Every agent declares `outputSchema` as Zod. At gateway call time it is serialized to JSON Schema and sent as `responseFormat.json_schema`.
- Gateway requests `temperature: 0.2` by default for structured tasks (configurable per agent).
- After raw `content` is received, `JSON.parse` + `outputSchema.parse()`. On parse/validation failure: one repair attempt with message `Your previous output failed schema validation: <issues>. Return ONLY valid JSON matching the schema.` If repair fails, persist `agent_run` as `failed` with `VALIDATION_ERROR` details.
- Never transition workflow state from unvalidated free-form text (per DEVELOPMENT-RULES.md §6).

---

## 12. Observability & Audit

Per PRD §24 and AGENTS.md §4, each agent run persists:
- `agent_definition_id`, `model_provider`, `model_name`, `prompt_version`
- `input`, `output` (truncated if large; full stored as jsonb)
- `usage_metadata` (tokens, cost when available)
- `latency_ms`, `status`, `correlation_id` / `taskId` (= workflow_execution_id or request id)
- `error_metadata` on failure

Additionally:
- `agent_events` rows for `step_started`, `step_completed`, `tool_called`, `model_fallback`, `validation_retry`.
- `audit_events` for workflow create/execute/approve/resume.
- Pino structured logs with `requestId`, `correlationId`, `agentId`, `model`, `latencyMs`.

No hidden chain-of-thought is persisted (per AGENTS.md §4).

---

## 13. Error Handling & Resilience

- Gateway fallback: one automatic fallback model on 429/5xx/timeout. Logs `model_fallback` event. If fallback also fails, surface `PROVIDER_ERROR` with both errors in `details`.
- Workflow step retry: only retriable errors (`PROVIDER_ERROR`, `TIMEOUT`) are retried per `retryPolicy`. Validation and approval rejections are not retried.
- BullMQ job failures are recorded in `workflow_steps.error` and `agent_runs.error_metadata`; workflow can be resumed via `POST /.../resume`.
- Idempotency: `workflow_executions` + `workflow_steps` updates are transactional; re-enqueueing a completed execution is a no-op (returns current status).
- Redis unavailable: queue degrades to in-process execution; gateway model cache degrades to in-memory; API still serves sync agent runs.

---

## 14. Security & Privacy

- All `/api/*` routes require JWT (existing `auth` plugin). Ownership checks: executions are scoped to `created_by = req.user.id`; admin bypass is not added in Phase 2.
- No secrets in logs or DB. `NINE_ROUTER_API_KEY` stays in env/secret manager, never returned via API.
- Tool `fetch_url` validates URL scheme (https only by default), blocks private IP ranges, enforces max response bytes (1 MB) and timeout (10s).
- Input validation at every boundary (Zod). Output validation before state transition.
- Prompt injection: system prompt is fixed and not concatenated with untrusted user content without delimiter; tools do not execute model output as code.

---

## 15. Configuration (Env)

Existing env keys reused (from `packages/shared/src/env.ts`):

- `NINE_ROUTER_API_KEY`, `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_DEFAULT_MODEL` — gateway.
- `DATABASE_URL`, `REDIS_URL` — persistence + queue.
- `LOG_LEVEL`, `CORS_ORIGIN`, `JWT_SECRET` — existing.

No new required env vars in Phase 2. Optional: `SEARCH_PROVIDER`, `SEARCH_API_KEY` for real `web_search` (defaults to mock).

---

## 16. Testing Strategy

Per `docs/TESTING.md`:

- **Unit:**
  - `routingPolicy.selectModel()` — capability filtering, budget, fallback ordering.
  - `BaseAgent` input/output validation, repair retry, tool filtering.
  - `WorkflowEngine` topological sort, gate detection, resume logic (pure functions, mocked DB/BullMQ).
  - Tool input validation.
- **Integration (mocked externals):**
  - `NineRouterGateway.chat()` with mocked `fetch` — success, fallback, timeout, usage extraction.
  - `AgentService.run()` persists `agent_runs`/`tool_runs` (test DB).
  - `WorkflowEngine.execute()` with in-memory BullMQ or real Redis in CI — linear workflow `research→strategist→copywriter` completes, approval gate pauses and resumes, failure + retry.
- **Agent evaluation fixtures:**
  - Research: sample queries with expected source shape, provenance presence, freshness field.
  - Strategist: given research fixture, expected angle/slideStructure shape.
  - Copywriter: given strategist fixture, expected slide count, caption, no unsupported claims.
- **Contract tests:** Zod schemas for all agent I/O.

Coverage gate: `pnpm test` must pass; lints and `tsc --noEmit` must pass (per Definition of Done in AGENTS.md §8).

---

## 17. Rollout & Dependencies

- Depends on Phase 0 (DB, auth, env) and Phase 1 (HQ shell) — both done.
- Migration is additive; no downtime. Seed data for `agent_definitions` and `workflow_definitions` runs after migration.
- BullMQ requires `redis` package + `bullmq` package (already have `redis` optionally; adding `bullmq` is the only new prod dependency).
- Feature flag not needed; new routes are additive and require auth.

---

## 18. Open Questions (Resolved for Phase 2)

- 9Router adapter: **Direct HTTP** (thin wrapper, no SDK) — keeps provider behind interface, easy to swap.
- Orchestration: **Full DAG** from the start — avoids rework; Phase 2 seeds a linear workflow to prove it, but engine supports branching for later phases.
- First agents: **Research → Strategist → Copywriter** — validates content production path early.
- Queue: **BullMQ** from the start — needed for retries/scheduling/resume; degrade gracefully if Redis absent.
- Schema: **All agent/workflow tables now** — one migration, avoids later conflicts.

---

## 19. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 9Router API shape differs from assumption | Gateway is the only place that knows 9Router; adapter interface isolates change. Add contract test with recorded fixture. |
| Model returns invalid JSON | Structured output + repair retry + schema validation before state transition. |
| Redis unavailable in dev/CI | Optional Redis pattern already in codebase; queue degrades to in-process. |
| Workflow DAG complexity | Start with linear workflow; DAG engine is tested with pure-function unit tests before DB/queue. |
| Cost overrun | Routing policy budget guardrail + usage logging per run. |

---

## 20. Spec Self-Review

- [x] No TBD/TODO placeholders.
- [x] Sections are internally consistent (gateway → agents → tools → orchestration → DB → API → observability).
- [x] Scope is one phase (Agent Runtime + 9Router); content UI and analytics are explicitly out of scope.
- [x] Ambiguities resolved (auth header, fallback count, approval semantics, resume idempotency).
- [x] Follows AGENTS.md, PRD.md, ARCHITECTURE.md, AGENT-SPEC.md, WORKFLOWS.md, DATA-MODEL.md, DEVELOPMENT-RULES.md, TESTING.md.

---

## 21. Next Step

After user approval of this spec, invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-10-06-phase2-agent-runtime-plan.md` with phased tasks, file list, and execution order.
