# KantorKu-AI — OpenCode Operating Instructions

## 1. Purpose

KantorKu-AI is a personal AI Office for a trading-focused creator. The user is the Founder, Head Trader, and Editor-in-Chief. AI agents perform research, analysis, content production, design, QA, analytics, knowledge management, and growth analysis. TikTok publishing remains manual in the MVP.

## 2. Source-of-Truth Hierarchy

When documents conflict, use this priority:

1. `AGENTS.md` — engineering-agent behavior and non-negotiable repository rules.
2. `docs/PRD.md` — product requirements and scope.
3. `docs/ARCHITECTURE.md` — technical architecture and boundaries.
4. `docs/AGENT-SPEC.md` — AI agent contracts.
5. `docs/WORKFLOWS.md` — workflow/state rules.
6. `docs/DATA-MODEL.md` — persistence contracts.
7. `docs/DESIGN-SYSTEM.md` — UI/visual rules.
8. `docs/DEVELOPMENT-RULES.md` — implementation conventions.
9. `docs/TESTING.md` — testing and evaluation requirements.
10. `docs/ROADMAP.md` — phase sequencing and scope boundaries.

Do not invent a conflicting rule when a higher-priority document already defines the behavior.

## 3. Core Engineering Rules

- Inspect the existing repository before changing files.
- Implement only the phase/task explicitly requested.
- Do not silently expand scope.
- Prefer small, composable modules over large monoliths.
- Reuse existing abstractions before creating duplicates.
- Keep business rules out of UI components.
- Keep provider-specific logic behind adapters/interfaces.
- Never hardcode secrets, API keys, tokens, or credentials.
- Never hardcode brand assets, promotional logos, CTA copy, or template content that should be configuration-driven.
- Preserve auditability: important AI and workflow actions must be persisted or logged.
- Make workflow steps resumable and idempotent where practical.
- Do not bypass human approval gates.
- Never mutate an approved script silently. Approved script content is locked until a deliberate revision is requested.
- Do not overwrite historical content, analytics imports, prompts, or design versions without versioning.
- Do not delete user data as part of a normal retry or regeneration.
- Prefer deterministic structured outputs for agent-to-agent contracts.

## 4. AI / 9Router Rules

- 9Router is the model gateway for KantorKu-AI.
- Agents must not call vendor SDKs directly from business logic when an internal model-provider abstraction can be used.
- Model selection must be policy-driven by task complexity, quality requirement, latency, and cost.
- Every production agent run must record provider/model, prompt version, token/usage metadata when available, latency, status, and correlation/task ID.
- Add fallback behavior for provider/model failures where safe.
- Do not expose hidden chain-of-thought. Persist concise operational reasoning summaries, decisions, evidence, and citations instead.

## 5. Creator Material Rules

- User-provided material has `Creator Source Priority` for the creator's intended analysis.
- AI may organize, summarize, clarify, and transform user material but must not silently replace the user's trading thesis.
- When a user asks for independent analysis, AI may provide a separate analysis clearly labeled as AI analysis.
- Every important insight derived from creator material must preserve provenance to the originating material/source.
- Multiple files can form a `Source Pack` and one Source Pack may generate multiple content projects.

## 6. Approval Rules

Content lifecycle requires two human checkpoints:

1. Script/content approval before design.
2. Final visual approval after design and visual QA.

Once script approval occurs, the approved script is locked. Design agents may alter layout and presentation only; they must not materially rewrite approved content without creating a revision request.

## 7. Security / Privacy

- Treat user trading data, uploaded charts, notes, analytics, credentials, and brand assets as private by default.
- Scope data access to the authenticated user and authorized internal services.
- Use least privilege.
- Sanitize uploaded files and validate MIME type, size, and extension.
- Never trust model output as executable code.
- Keep system prompts and provider credentials server-side.

## 8. Definition of Done

A task is not complete until:

- implementation matches the relevant documents;
- migrations/schema changes are applied when needed;
- tests are added/updated;
- lint/type checks pass;
- relevant workflow/agent evaluation passes;
- error paths have been considered;
- no secrets are committed;
- documentation is updated when behavior changes.

## 9. Git Rules

- Use clear, scoped commits.
- Avoid unrelated refactors in feature commits.
- Do not rewrite history unless explicitly requested.
- Commit messages should describe intent, not implementation noise.
- Before committing, inspect `git diff` and relevant status.

## 10. Communication Rules for OpenCode

Before coding:
- summarize the relevant requirement;
- list the files/modules likely to change;
- identify assumptions only when truly necessary.

After coding:
- report what changed;
- report tests/checks run;
- report any unresolved risk or limitation;
- do not claim success for checks that were not actually run.
