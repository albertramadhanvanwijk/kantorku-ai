# KantorKu-AI — Implementation Roadmap

## Phase 0 — Repository & Foundation

Goal: establish a stable monorepo and local development foundation.

Scope:

- repository structure;
- TypeScript configuration;
- Nuxt app;
- Node API;
- PostgreSQL;
- Redis;
- migrations;
- authentication foundation;
- environment configuration;
- logging;
- basic CI/checks.

Exit criteria:

- local stack runs reproducibly;
- database migration works;
- frontend talks to backend;
- no secrets in repository.

## Phase 1 — HQ / Office Shell

Scope:

- navigation;
- HQ dashboard;
- task summary;
- AI activity feed;
- AI employee status;
- Office Mode 2.5D shell;
- Workspace Mode shell.

Exit criteria:

- office UI is usable;
- agent states are data-driven.

## Phase 2 — Agent Runtime + 9Router

Scope:

- model gateway;
- 9Router adapter;
- agent registry;
- structured outputs;
- orchestration runtime;
- agent run logs;
- basic tool registry.

Exit criteria:

- orchestrator can invoke specialist agent;
- model/provider metadata recorded;
- failure/retry works.

## Phase 3 — Creator Material / Source Room

Scope:

- file upload;
- material classification;
- Source Pack;
- metadata;
- provenance;
- Transform My Analysis;
- Analyze My Charts.

Exit criteria:

- multiple charts can form a Source Pack;
- source provenance is preserved.

## Phase 4 — Content Factory

Scope:

- content projects;
- ideas;
- content strategist;
- hooks;
- copywriter;
- captions;
- content pipeline.

Exit criteria:

- end-to-end script generation works.

## Phase 5 — Carousel / Creative Engine

Scope:

- template engine;
- category-specific templates;
- brand system;
- promotion brands;
- CTA/multi-CTA;
- slide rendering;
- creative workspace.

Exit criteria:

- all five categories have usable template families;
- logos and CTA are configuration-driven.

## Phase 6 — QA + Dual Human Approval

Scope:

- Risk & Fact Check;
- Visual QA;
- script approval;
- script lock;
- visual approval;
- revision/version history;
- recovery paths.

Exit criteria:

- design cannot start before approved script;
- visual approval required before `READY_TO_UPLOAD`.

## Phase 7 — TikTok Analytics CSV

Scope:

- CSV uploader;
- auto-detection;
- Ikhtisar/Konten/Pemirsa/Pengikut mapping;
- raw archive;
- normalized storage;
- derived metrics;
- content mapping.

Exit criteria:

- imports are reprocessable and historically stored;
- dashboard can show normalized metrics.

## Phase 8 — Knowledge + Trading DNA

Scope:

- Personal Trading DNA;
- brand voice;
- historical content memory;
- semantic search;
- anti-repetition.

Exit criteria:

- content agents retrieve relevant user knowledge;
- duplicate/near-duplicate topic warnings work.

## Phase 9 — Growth Intelligence

Scope:

- Content Performance Agent;
- Content Intelligence Score;
- campaign analysis;
- experiments;
- recommendations.

Exit criteria:

- AI can identify performance patterns from imported history.

## Phase 10 — Advanced Optimization / Optional Integrations

Potential scope:

- richer official TikTok integrations if viable;
- ads integration with explicit human financial approval;
- advanced automation;
- multi-platform expansion.

Only start after MVP stability.

## Phase Rules

- Implement one phase at a time.
- Do not start future phases unless explicitly requested.
- Each phase has acceptance criteria.
- A phase is complete only when implementation + tests + documentation meet the criteria.
