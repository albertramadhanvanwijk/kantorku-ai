# KantorKu-AI — Technical Architecture

## 1. Recommended Stack

### Frontend

- Nuxt / Vue
- TypeScript
- Tailwind CSS
- Component system using a consistent reusable UI library
- Canvas/SVG/CSS-based 2.5D Office Mode

### Backend

- Node.js + TypeScript
- Fastify preferred for a lightweight API layer
- Dedicated service/modules for orchestration, agents, workflows, and integrations

### Data

- PostgreSQL
- pgvector for semantic knowledge retrieval
- Redis for queues, short-lived state, locks, and rate control

### Job Processing

- BullMQ or equivalent Redis-backed job queue

### Asset Storage

- S3-compatible object storage or local filesystem adapter for self-hosted MVP

### AI

- 9Router as model gateway
- Internal provider adapter so routing does not leak into business logic

## 2. Architectural Shape

```text
Nuxt Web App
    ↓
API Layer
    ↓
Application Services
    ├── Content Service
    ├── Workflow Service
    ├── Analytics Service
    ├── Knowledge Service
    └── Asset Service
    ↓
AI Orchestrator
    ├── Agent Runtime
    ├── Tool Registry
    ├── Model Router (9Router)
    └── Guardrails
    ↓
Infrastructure
    ├── PostgreSQL / pgvector
    ├── Redis / Queue
    ├── Object Storage
    └── External Tools / Web / Market Data
```

## 3. Monorepo Recommendation

```text
kantorku-ai/
├── AGENTS.md
├── README.md
├── .env.example
├── docs/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── agents/
│   ├── workflows/
│   ├── tools/
│   ├── schemas/
│   ├── ui/
│   └── shared/
├── database/
└── tests/
```

Use a workspace/monorepo manager such as pnpm unless the repository already has a strong convention.

## 4. Layering Rules

### Presentation

UI components should render state and dispatch commands. They should not contain orchestration logic.

### Application

Use application services/use-cases to coordinate domain behavior.

### Domain

Keep content, workflow, approval, analytics, campaign, brand, and knowledge rules here.

### Infrastructure

Database, queue, object storage, 9Router, web search, market data, and external APIs belong behind adapters.

## 5. Agent Architecture

```text
AI COO / Orchestrator
        ↓
Workflow Definition
        ↓
Agent Registry
        ↓
Specialist Agent
        ↓
Tool Registry
        ↓
Tool Adapter
```

The orchestrator owns workflow order, state transition, retries, approval gates, and final aggregation.

## 6. Agent-to-Agent Contract

Prefer structured JSON schemas between agents.

Each specialist agent should define:

- input schema;
- output schema;
- allowed tools;
- required provenance;
- guardrails;
- failure semantics.

## 7. Tool Architecture

Suggested tools:

- web search;
- source fetch/verification;
- market data retrieval;
- chart metadata/analysis;
- knowledge search;
- content history search;
- asset storage;
- image/slide generation;
- CSV parsing/mapping;
- analytics calculation;
- notification/task tools.

Tools should be deterministic where possible.

## 8. Workflow Engine

Workflows should be explicit state machines, not ad-hoc chains in UI code.

Every workflow execution should have:

- execution ID;
- project ID;
- current state;
- step status;
- retries;
- timestamps;
- correlation ID;
- error metadata.

## 9. Event / Queue Model

Long-running tasks should be queued.

Example:

```text
content.created
      ↓
workflow.start
      ↓
research.requested
      ↓
analysis.requested
      ↓
script.generated
      ↓
approval.requested
      ↓
design.requested
      ↓
visual_qa.completed
      ↓
approval.requested
```

Events should be idempotent.

## 10. 9Router Integration

Create an abstraction similar to:

```text
ModelProvider
├── generateStructured()
├── generateText()
└── streamText()
```

A separate routing policy determines:

- requested capability;
- model tier;
- fallback;
- budget;
- timeout;
- retry behavior.

The rest of the application should not need to know which model is selected.

## 11. Creator Material Pipeline

```text
Upload
  ↓
File Validation
  ↓
Metadata Extraction
  ↓
Material Classification
  ↓
Material Record
  ↓
Source Pack
  ↓
Agent Processing
```

Store the original asset and normalized metadata separately.

## 12. Carousel Architecture

Treat carousel as structured data, not only images.

```text
ContentProject
  └── ContentVersion
        ├── Slide 1
        ├── Slide 2
        ├── Slide 3
        ├── Slide 4
        └── Slide 5
```

Each slide should have:

- semantic content;
- visual elements;
- layout/template reference;
- generated asset references;
- validation status.

## 13. Design Engine

Use a template-definition model with configurable layout slots.

Avoid hardcoding each carousel design as an individual page.

Recommended first implementation approach:

- HTML/CSS/SVG or canvas-based rendering;
- server-side render/export to PNG;
- reusable template components;
- optional chart snapshot embedding.

## 14. Analytics Import Architecture

```text
CSV Upload
   ↓
CSV Detector
   ↓
Category Classifier
   ├── Ikhtisar
   ├── Konten
   ├── Pemirsa
   └── Pengikut
   ↓
Schema Mapper
   ↓
Validation
   ↓
Raw Import Archive
   ↓
Normalized Tables
   ↓
Derived Metrics
   ↓
AI Analytics
```

The importer must preserve raw files and import metadata for reprocessing.

## 15. Analytics Content Mapping

Try to map TikTok content rows to KantorKu-AI content projects using stable identifiers when available.

Fallback matching strategy can use:

- TikTok URL/video ID;
- published timestamp proximity;
- normalized title/caption similarity;
- manual confirmation.

Never silently attach metrics to the wrong content.

## 16. Knowledge Architecture

Use hybrid retrieval:

- relational filters for exact metadata;
- pgvector semantic search for concepts and historical content.

Knowledge records should include provenance, category, version, and source type.

## 17. Observability

Capture:

- workflow execution;
- agent run;
- tool call;
- model/provider metadata;
- errors;
- user approval;
- content version changes.

Make it queryable in an Activity/Audit UI.

## 18. Security

- Authenticated application.
- Server-side secrets only.
- Encrypted transport.
- Input validation.
- Upload limits.
- Safe filename handling.
- CSRF/session protection according to framework strategy.
- Least-privilege internal service access.
- Audit sensitive actions.

## 19. Resilience

- retries for transient provider/network failures;
- exponential backoff;
- idempotency keys;
- dead-letter/error state;
- resumable workflows;
- timeout per external tool/provider.

## 20. Scalability Direction

MVP can run as a single deployment with worker process.

Later it can split into:

```text
Web
API
Worker
AI Runtime
Analytics Worker
Asset Service
```

Do not prematurely introduce microservices.
