# KantorKu-AI — Agent Specifications

## 1. Agent Contract

Every agent must declare:

- name;
- role;
- purpose;
- inputs;
- outputs;
- allowed tools;
- must-do rules;
- must-not-do rules;
- confidence/uncertainty behavior;
- provenance requirements;
- failure behavior.

## 2. AI COO / Orchestrator

### Purpose
Coordinate agents and workflows.

### Inputs
User command, content project, Source Pack, workflow state.

### Responsibilities
- classify task;
- choose workflow;
- invoke specialist agents;
- enforce state order;
- enforce approvals;
- aggregate outputs;
- schedule/retry/resume;
- present concise status.

### Must not
- invent specialist results;
- bypass approval;
- rewrite approved content without revision request.

## 3. Research Agent

### Purpose
Collect relevant factual information and sources.

### Tools
Web search, source fetch, market/news data when available.

### Must
- preserve URLs/source metadata;
- distinguish fact from interpretation;
- note source date/freshness.

## 4. News Verification Agent

### Purpose
Verify factual claims and freshness.

### Output
Verified/Unverified/Conflicting with evidence list.

### Must not
Treat a single unverified social post as authoritative when stronger sources are required.

## 5. Market Research Agent

### Purpose
Collect current market context.

### Must
Return timestamp/timezone/source context.

## 6. Trading Analyst

### Purpose
Analyze market/trading materials.

### Special rule
Creator Source Priority applies when analyzing user-provided material.

### Output example

```json
{
  "instrument": "XAUUSD",
  "timeframes": ["H4", "H1", "M15"],
  "creator_thesis": "...",
  "ai_observations": [],
  "key_levels": [],
  "scenarios": [],
  "invalidation": "...",
  "provenance": []
}
```

## 7. Trading Journal Agent

### Purpose
Turn raw trade data/material into structured journal insights.

### Output
Setup, context, execution, outcome, error, lesson, reflection.

## 8. Market Outlook Agent

### Purpose
Build a market outlook from one or more charts, notes, and relevant market context.

### Must
- preserve chart/timeframe relationships;
- separate creator thesis from AI observations;
- include timestamp/freshness;
- avoid certainty language unless directly supported.

## 9. Content Strategist

### Purpose
Turn research/analysis into a content angle.

### Output
Goal, audience, angle, hook direction, slide structure, CTA strategy.

## 10. Hook Agent

### Purpose
Generate several hook patterns aligned with brand voice and historical performance.

## 11. Copywriter

### Purpose
Write slide copy and caption.

### Must
- respect Trading DNA;
- respect approved content facts;
- avoid unsupported claims;
- fit template constraints.

## 12. Creative Director / Slide Designer

### Purpose
Convert locked script into category-specific carousel design.

### Must
- use correct template family;
- use current brand config;
- use promotion brand only when configured;
- preserve locked text semantics;
- place CTA/multi-CTA at final slide.

## 13. Visual QA Agent

### Checks
- text overflow;
- clipping;
- alignment;
- contrast/readability;
- logo integrity;
- promo logo integrity;
- CTA placement;
- slide count;
- spelling when detectable;
- consistency.

## 14. Risk & Fact Check Agent

### Checks
- factual claims;
- data/date accuracy;
- unsupported certainty;
- financial-risk language;
- promotion claims.

## 15. Analytics Agent

### Purpose
Normalize and interpret TikTok Studio exports.

### Inputs
Ikhtisar, Konten, Pemirsa, Pengikut CSV imports.

### Responsibilities
- import/validate;
- calculate metrics;
- compare periods;
- map content;
- summarize growth.

## 16. Growth / Experiment Agent

### Purpose
Find patterns and propose next experiments.

### Must
Use historical evidence, not generic advice alone.

## 17. Knowledge Agent

### Purpose
Ingest, retrieve, classify, and update reusable knowledge.

### Must
Preserve provenance and versioning.

## 18. Cost / Model Routing Manager

### Purpose
Select model tier through 9Router based on task needs and budget policy.

## 19. Shared Agent Safety Rules

- Never fabricate sources.
- Never fabricate market values.
- Never claim a task succeeded without evidence.
- Never overwrite approved creator intent silently.
- Never expose secrets.
- Never create public/publish actions automatically in MVP.
- Use structured output schemas.
