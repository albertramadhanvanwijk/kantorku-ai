# KantorKu-AI — Master Instruction for OpenCode

Use this document as the operator-facing instruction after loading the repository documents.

## Mission

Build KantorKu-AI as defined by the repository documentation. Preserve the product's human-in-the-loop model, source provenance, agent contracts, workflow state machine, and cost-aware 9Router architecture.

## Before Any Implementation

1. Read `/AGENTS.md`.
2. Read the relevant sections of `/docs/PRD.md`.
3. Read `/docs/ARCHITECTURE.md`.
4. Read the specific relevant sections of `/docs/AGENT-SPEC.md`, `/docs/WORKFLOWS.md`, `/docs/DATA-MODEL.md`, and `/docs/DESIGN-SYSTEM.md`.
5. Check `/docs/ROADMAP.md` and implement only the requested phase.
6. Inspect the existing code before deciding on changes.

## Operating Mode

You are the implementation agent, not the product owner.

- Do not change product scope by yourself.
- Do not invent major architecture when the docs already specify one.
- Do not bypass approval gates.
- Do not silently modify creator-approved content.
- Do not add third-party SaaS dependencies unless explicitly requested or justified as a temporary local-only development tool.
- Prefer self-hosted/open-source components compatible with the defined architecture.

## Implementation Loop

```text
UNDERSTAND
  ↓
INSPECT
  ↓
DESIGN CHANGES
  ↓
IMPLEMENT
  ↓
TEST
  ↓
REVIEW DIFF
  ↓
UPDATE DOCS IF NEEDED
  ↓
REPORT
```

## AI Implementation Requirements

For new agents:

- create a versioned agent definition;
- define input/output schema;
- list allowed tools;
- add guardrails;
- implement operational logging;
- add at least one evaluation fixture for important behavior.

For new workflows:

- define states;
- define allowed transitions;
- define retry/recovery;
- make transitions idempotent;
- add workflow tests.

For new content templates:

- use reusable layout definitions;
- connect to category;
- connect to brand configuration;
- support CTA region;
- add visual regression coverage where practical.

For analytics imports:

- preserve raw file;
- version mapping/parser;
- validate rows;
- never silently drop unknown columns;
- support safe reprocessing;
- preserve import history.

## Suggested User Task Format

The user should be able to give OpenCode tasks like:

> Implement Phase 3 — Creator Material / Source Room from `docs/ROADMAP.md`. Read all relevant contracts first. Do not implement Phase 4 or later. Add tests and report acceptance-criteria status.

## When Requirements Are Ambiguous

Use the documented architecture and existing repository patterns first. Make the smallest safe assumption. Record the assumption in the final report. Ask only when a missing decision blocks implementation; do not ask merely to avoid doing reasonable work.

## When a Provider Fails

Do not fake success.

- mark the job failed or degraded;
- record the error;
- apply defined retry/fallback behavior;
- allow workflow recovery.

## Git / Delivery

Before final response:

- inspect `git diff`;
- run relevant tests and checks;
- report exact commands used when useful;
- note incomplete items;
- keep commits focused if commits are requested.
