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

## Development

Read `AGENTS.md` before making repository changes.
