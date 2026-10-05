# KantorKu-AI — Product Requirements Document

## 1. Product Overview

**KantorKu-AI** is a personal AI Office designed to multiply the productivity of a trading-focused creator who produces TikTok carousel content. The user remains the final decision maker and manual publisher. KantorKu-AI automates the operational work around research, trading-material processing, content planning, copywriting, carousel generation, quality assurance, analytics, knowledge management, promotion, and growth intelligence.

### Core product statement

> Turn the creator's trading knowledge, charts, notes, journal entries, market information, and content performance data into high-quality, brand-consistent carousel content through a human-in-the-loop AI Office.

## 2. Product Principles

1. **Human-led** — creator owns trading thesis, final message, and publication decision.
2. **AI-operated** — agents perform repetitive research, analysis, writing, design, QA, and analysis tasks.
3. **Source-grounded** — facts and important insights have provenance.
4. **Brand-consistent** — each content category has its own visual template family while preserving the core brand system.
5. **Cost-aware** — 9Router model usage is routed based on need and cost.
6. **Resumable** — failures should restart from the failed step, not the entire workflow.
7. **Observable** — every significant agent/workflow action is traceable.
8. **Private by default** — this is initially a personal/private system.

## 3. Primary User

One creator/operator who:

- performs their own trading analysis;
- produces trading-focused TikTok carousel content;
- uploads content to TikTok manually;
- wants a personal AI team to support the workflow;
- wants TikTok analytics imported from CSV for historical intelligence;
- wants promotional brand/campaign assets supported in carousel content.

## 4. Content Categories

### 4.1 Trading Education
Educational trading concepts, market structure, liquidity, entries, risk management, psychology, and related topics.

### 4.2 Propfirm Education
Educational content around prop firms, evaluation, funded accounts, processes, rules, experiences, and related topics.

### 4.3 Trading Journal
User's real trade/journal stories, including setup, execution, outcome, mistakes, lesson, and reflection.

### 4.4 Daily Market Outlook
Daily market outlook based on the user's own analysis, possibly combining several instruments, charts, and timeframes into one content project.

### 4.5 Global Market / News
Market-relevant global information, macro events, economic news, and market-impact explanations.

## 5. Core Office Departments

- **HQ / AI COO** — orchestrates work.
- **Research Office** — web/news/market research and source verification.
- **Trading Intelligence Office** — trading journal, multi-chart analysis, market outlook, trading DNA.
- **Content Studio** — ideas, strategy, scripts, hooks, captions.
- **Creative Studio** — carousel generation, template engine, brand assets, CTA/promotion.
- **QA & Compliance Office** — factual checks, financial-safety checks, visual QA.
- **Analytics & Growth Office** — TikTok CSV import, analytics, content intelligence, experimentation.
- **Knowledge Center** — personal profile, trading DNA, brand voice, historical content, reusable knowledge.
- **Task / Workflow Center** — jobs, status, approvals, retries, history.

## 6. Office UI Concept

The product uses a **hybrid 2.5D/isometric office visualization** for the “Office Mode” experience and standard 2D dashboards for productivity.

### Office modes

- **Office Mode** — visual office, departments, AI employee status, light animations.
- **Workspace Mode** — focused 2D production interfaces.
- **Command Mode** — AI COO conversation and task commands.

3D is not the primary interface for MVP.

## 7. AI Employee Model

The system uses a central orchestrator and specialist agents. Agents do not freely communicate without orchestration. The orchestrator calls specialist agents/tools based on the workflow.

Primary agents:

- AI COO / Orchestrator
- Research Agent
- News Verification Agent
- Market Research Agent
- Trading Analyst
- Trading Journal Agent
- Market Outlook Agent
- Content Strategist
- Hook Agent
- Copywriter
- Creative Director / Slide Designer
- Visual QA Agent
- Risk & Fact Check Agent
- Analytics Agent
- Growth / Experiment Agent
- Knowledge Agent
- Cost / Model Routing Manager

## 8. Creator Material Intake / Source Room

The user can supply source materials directly. Supported material types include:

- multiple charts;
- annotated chart screenshots;
- trade screenshots;
- text notes;
- trade data;
- news screenshots/links;
- promotional assets;
- logos;
- documents and reference files.

### Source Pack

Multiple materials can be grouped into a Source Pack. A Source Pack stores metadata and provenance and can produce one or more content projects.

### Two processing modes

**Transform My Analysis**

- treat user analysis as primary source;
- preserve creator thesis;
- improve structure and presentation;
- do not silently replace analysis.

**Analyze My Charts**

- perform independent AI analysis;
- clearly label AI observations separately from creator analysis;
- offer content angles for selection.

## 9. Market Outlook from Multiple Charts

A Market Outlook project may use several charts, for example:

- H4 for higher-timeframe context;
- H1 for structure;
- M15 for setup;
- M5 for execution detail;
- multiple instruments in one Source Pack when appropriate.

The system must preserve the relationship between chart/timeframe and extracted insight.

Every market-sensitive content artifact should carry data freshness metadata, including analysis timestamp/timezone and relevant market snapshot timestamp when available.

## 10. Content Production Workflow

```text
IDEA
  ↓
MATERIAL INTAKE
  ↓
SOURCE PACK
  ↓
RESEARCH / TRADING ANALYSIS
  ↓
CONTENT BRIEF
  ↓
SCRIPT DRAFT
  ↓
HUMAN APPROVAL #1
  ↓
SCRIPT LOCK
  ↓
DESIGN
  ↓
AI VISUAL QA
  ↓
HUMAN APPROVAL #2
  ↓
READY TO UPLOAD
  ↓
MANUAL TIKTOK PUBLISH
  ↓
TIKTOK STUDIO CSV EXPORT
  ↓
ANALYTICS IMPORT
  ↓
CONTENT INTELLIGENCE
  ↓
NEXT CONTENT RECOMMENDATIONS
```

## 11. Human Approval

### Approval #1 — Script Approval

Creator checks:

- topic/angle;
- factual accuracy;
- trading interpretation;
- wording;
- hook;
- CTA;
- promotion claims.

Approval creates a script lock.

### Approval #2 — Visual Approval

Creator checks:

- final slide appearance;
- layout;
- typography;
- logo use;
- promotional logo;
- chart/annotation rendering;
- CTA/multi-CTA;
- spelling and cropping;
- overall publish readiness.

Visual approval is intentionally lightweight and does not restart the content approval process.

## 12. Carousel Template System

Each content category has different design template families:

- Trading Education — educational/chart/diagram oriented.
- Propfirm Education — educational + promotion oriented.
- Trading Journal — personal/storytelling oriented.
- Market Outlook — analytical/market dashboard oriented.
- Global News — editorial/news oriented.

Templates are layout systems, not static images.

A template can define regions such as:

- headline;
- subtitle;
- content body;
- chart/visual;
- annotation;
- key takeaway;
- logo region;
- promotional logo region;
- CTA region.

## 13. Brand & Promotion System

### Main brand

Central configuration for:

- main logo;
- alternate logo variants;
- typography;
- colors;
- spacing;
- watermark;
- visual identity rules.

### Promotion brand

Reusable configurations for partner/product brands:

- logo;
- campaign;
- promotion text;
- landing URL/CTA destination;
- start/end dates;
- usage rules.

The same promotion configuration can be reused across multiple content projects.

## 14. CTA / Multi-CTA System

Final slide must support CTA or multi-CTA, depending on the content/campaign.

Examples of CTA types:

- Join Community
- Learn More
- Check Details
- Follow for More
- Save This
- Comment / Discuss
- Visit Link
- Promo-specific CTA

CTA selection is driven by content goal and campaign configuration and must pass QA.

## 15. Content Memory / Anti-Repetition

Before proposing a topic/angle, the system should check historical content for semantic overlap.

The agent should prefer:

- new angles;
- updated data;
- follow-up explanations;
- case studies;
- lessons derived from new trades;
- content series continuity.

The system should warn when an idea is too similar to existing content.

## 16. Campaign System

Campaigns group content for a promotional or editorial objective.

Campaign fields should include:

- campaign name;
- objective;
- start/end dates;
- promotion brand;
- CTA strategy;
- content targets;
- analytics summary.

Campaign analytics should later answer which campaign performs best, not only which single post performs best.

## 17. TikTok Analytics — MVP Approach

Publishing remains manual.

Analytics use a manual export/import workflow from TikTok Studio.

Expected CSV categories:

1. **Ikhtisar**
2. **Konten**
3. **Pemirsa**
4. **Pengikut**

Workflow:

```text
TikTok Studio
  ↓
Export CSV
  ↓
AI Office Analytics Import
  ↓
Auto-detect file/category
  ↓
Validate / Map / Deduplicate
  ↓
Store raw import + normalized data
  ↓
Historical analytics
  ↓
AI analytics
```

The exact CSV columns may evolve. The importer must be schema-tolerant, versioned, and configurable rather than relying on one rigid column mapping.

## 18. Analytics Intelligence

The analytics system should progress from metrics to insights.

It should analyze:

- account growth;
- content performance;
- category performance;
- topic performance;
- hook performance;
- posting-time performance;
- engagement patterns;
- audience characteristics;
- follower growth patterns;
- campaign performance.

Potential derived metrics include like rate, comment rate, share rate, engagement rate, growth vs previous period, and relative performance vs account baseline.

## 19. Content Performance Agent

It should answer questions such as:

- Why did this content outperform?
- Which category performs best?
- Which hook pattern performs best?
- Which content should be replicated?
- Which topics are declining?
- What new content experiments should be run?

## 20. Content Experiment Agent

The system should propose controlled experiments involving:

- hook variations;
- topic angles;
- slide count;
- CTA variations;
- posting windows;
- category/topic combinations.

Experiment outcomes become knowledge for future content planning.

## 21. Personal Trading DNA

The knowledge system should store the user's trading-specific communication framework, including:

- preferred trading concepts;
- terminology;
- framework;
- risk philosophy;
- explanation style;
- common setups;
- preferred language/tone;
- known mistakes/lessons.

This is used to make AI output sound like the creator instead of a generic trading content account.

## 22. Financial Safety Gate

The system must flag or rewrite unsupported certainty and misleading financial claims.

Examples of risky wording:

- guaranteed profit;
- 100% win;
- pasti naik;
- pasti TP;
- no loss;
- guaranteed result.

The system should distinguish education, analysis, opinion, scenario, and prediction.

## 23. AI Cost Manager

9Router usage should be cost-aware.

The system should support routing policies such as:

- simple classification → low-cost model;
- summarization → low/mid-cost model;
- research synthesis → mid-cost model;
- trading reasoning → stronger model;
- final review → stronger model.

Track usage/cost when provider data supports it and expose configurable budgets/guardrails.

## 24. Observability / Audit Trail

Persist or log enough operational information to answer:

- which agent ran?
- which model/provider ran?
- what source materials were used?
- what tools were called?
- what output was generated?
- what version of prompt/agent/template was used?
- who approved/rejected?
- when did the step run?
- what error occurred?

Do not store hidden chain-of-thought.

## 25. Versioning

Version the following:

- agents;
- prompts;
- templates;
- brand configuration;
- scripts;
- designs;
- analytics imports/mappings.

Historical versions must remain inspectable and rollback-friendly.

## 26. Non-Goals for MVP

- Automatic public TikTok publishing.
- Fully autonomous ad spending.
- Multi-tenant SaaS.
- Public user registration for arbitrary users.
- Complex full 3D office rendering.
- Autonomous trading execution.

## 27. MVP Success Criteria

The MVP is successful when a user can:

1. open HQ;
2. create a content project;
3. upload multiple creator materials into a Source Pack;
4. run the relevant agent workflow through 9Router;
5. review and approve a script;
6. generate a category-specific carousel;
7. pass visual QA;
8. approve final visuals;
9. export/download final carousel assets;
10. upload manually to TikTok;
11. export TikTok Studio CSVs for Ikhtisar, Konten, Pemirsa, and Pengikut;
12. import those CSVs into KantorKu-AI;
13. view normalized historical analytics;
14. receive AI-generated content performance insights.

## 28. Future Direction

Potential future integrations include official TikTok APIs if access/approval and economics make sense, richer analytics automation, ad management, multi-platform distribution, and broader personal-agent automation. These must not compromise the core human approval model.
