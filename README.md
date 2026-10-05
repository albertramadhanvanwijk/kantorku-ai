# KantorKu-AI

KantorKu-AI is a personal AI Office for a trading-focused creator.

## Core Concept

The creator remains Founder / Head Trader / Editor-in-Chief. AI departments perform research, trading analysis, content strategy, carousel design, QA, analytics, knowledge management, campaign support, and growth intelligence.

TikTok publishing remains manual in MVP. TikTok Studio analytics are exported as CSV and imported into KantorKu-AI in four categories:

- Ikhtisar
- Konten
- Pemirsa
- Pengikut

The product uses 9Router as the AI/model gateway.

## Documentation

- `AGENTS.md` — OpenCode operating rules.
- `docs/PRD.md` — product requirements.
- `docs/ARCHITECTURE.md` — technical architecture.
- `docs/AGENT-SPEC.md` — agent contracts.
- `docs/WORKFLOWS.md` — state machines/workflows.
- `docs/DATA-MODEL.md` — database/data contracts.
- `docs/DESIGN-SYSTEM.md` — UI, Office Mode, carousel design system.
- `docs/DEVELOPMENT-RULES.md` — coding/engineering conventions.
- `docs/TESTING.md` — tests and agent evaluation.
- `docs/ROADMAP.md` — phased implementation.
- `docs/OPENCODE-INSTRUCTIONS.md` — master execution instruction for OpenCode.

## Key Workflow

```text
Creator Material / Idea
      ↓
Research / Trading Analysis
      ↓
Script
      ↓
Human Approval #1
      ↓
Script Lock
      ↓
Carousel Design
      ↓
Visual QA
      ↓
Human Approval #2
      ↓
Ready to Upload
      ↓
Manual TikTok Upload
      ↓
TikTok Studio CSV Export
      ↓
Analytics Import
      ↓
AI Performance Intelligence
```

## Phase 0 — Local Development Setup

### Prerequisites

- Node.js 20+
- pnpm 11+
- Docker & Docker Compose (for PostgreSQL & Redis)

### Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL & Redis
docker compose up -d postgres redis

# 3. Copy environment file and adjust values
cp .env.example .env

# 4. Run database migrations
pnpm db:migrate

# 5. Start development servers (API + Web)
pnpm dev
```

### Individual Commands

```bash
# Run API only
pnpm dev:api

# Run Web only
pnpm dev:web

# Run all checks (lint, typecheck, test, build)
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Database commands
pnpm db:generate  # Generate migrations after schema changes
pnpm db:migrate   # Run migrations
pnpm db:seed      # Seed database (idempotent placeholder in Phase 0)
```

### Service URLs (Default)

- **Web (Nuxt)**: http://localhost:3000
- **API (Fastify)**: http://localhost:4000
- **API Health**: http://localhost:4000/api/health
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Environment Variables

See `.env.example` for all configurable options. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/kantorku_ai` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | *required* |
| `AUTH_SECRET` | Auth cookie secret (min 32 chars) | *required* |
| `CORS_ORIGIN` | Allowed web origin | `http://localhost:3000` |

### Phase 0 Scope

- Monorepo structure (pnpm workspaces)
- Nuxt 3 frontend with TypeScript, Tailwind-ready
- Fastify API with TypeScript
- PostgreSQL with Drizzle ORM migrations
- Redis for caching/queues
- Zod-validated environment config
- Structured logging (pino)
- Health endpoints (`/api/health`, `/api/health/db`, `/api/health/redis`)
- Auth foundation: register, login, JWT, protected `/api/auth/me`
- Frontend ↔ API connectivity demo on homepage
- ESLint, TypeScript strict mode, Vitest unit tests
- Docker Compose for local infra

### Next Phases

- **Phase 1**: HQ / Office Shell (navigation, dashboard, 2.5D Office Mode)
- **Phase 2**: Agent Runtime + 9Router (model gateway, agent registry, orchestration)
- **Phase 3**: Content Pipeline (workflows, scripts, approvals, carousels)
- **Phase 4**: Analytics & Knowledge (import, analysis, RAG)
- **Phase 5**: Growth & Promotion (campaigns, scheduling, multi-channel)

## Development

Read `AGENTS.md` before making repository changes.
