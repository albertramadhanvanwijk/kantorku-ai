# KantorKu-AI — Testing & Evaluation

## 1. Testing Pyramid

1. Unit tests
2. Integration tests
3. Workflow tests
4. Agent evaluations
5. End-to-end tests
6. Visual regression where justified

## 2. Unit Tests

Test deterministic logic:

- analytics formulas;
- CSV classification;
- CSV mapping;
- content-state transitions;
- CTA selection rules;
- brand/template validation;
- cost routing policy.

## 3. Integration Tests

Test adapters and boundaries:

- PostgreSQL repositories;
- Redis queue;
- object storage;
- 9Router adapter;
- CSV parser;
- analytics import pipeline.

External services should be mocked or sandboxed where possible.

## 4. Workflow Tests

### Content workflow

Given valid material:

- research runs;
- analysis runs;
- script is produced;
- approval is required;
- design cannot begin before script approval;
- approved script becomes locked;
- design is generated;
- visual QA runs;
- final approval is required;
- workflow reaches `READY_TO_UPLOAD`.

### Rejection test

If script approval is rejected:

- workflow returns to editable script state;
- design is not created from rejected script;
- revision history is preserved.

### Visual rejection test

If visual approval is rejected:

- script remains locked unless content revision is requested;
- design can be revised;
- previous design version remains available.

## 5. Creator Material Evaluation

Test multi-file Source Pack creation:

- several chart images;
- mixed timeframes;
- text notes;
- trade screenshot.

Expected:

- every material has a unique ID;
- provenance is preserved;
- chart/timeframe metadata is not lost;
- Source Pack can produce multiple content projects.

## 6. Agent Evaluation

Maintain fixture sets for key agents.

### Trading Analyst
Evaluate:

- correct extraction of creator thesis;
- separation of AI observations;
- no fabricated levels;
- provenance presence;
- consistent structured output.

### Copywriter
Evaluate:

- voice consistency;
- no unsupported claims;
- template-aware length;
- CTA placement.

### Risk/Fact Check
Evaluate:

- detection of certainty claims;
- date/data claim checks;
- promotion claim checks.

## 7. Analytics Tests

Fixture CSVs should cover:

- Ikhtisar;
- Konten;
- Pemirsa;
- Pengikut.

Tests must cover:

- column order changes;
- extra columns;
- missing optional columns;
- invalid numeric values;
- duplicate imports;
- date/timezone handling;
- schema version changes.

## 8. Content Matching Tests

Validate:

- exact content ID match;
- URL/video ID match;
- high-confidence timestamp/title match;
- ambiguous match routed to user confirmation.

## 9. Visual Regression

At minimum, maintain snapshots for representative templates in each category:

- Trading Education
- Propfirm Education
- Trading Journal
- Market Outlook
- Global News

Compare:

- layout;
- logo placement;
- CTA area;
- text overflow;
- cropping.

## 10. Security Tests

Include:

- unauthorized project access;
- upload validation;
- path traversal prevention;
- secret exposure checks;
- XSS-sensitive rendering;
- prompt/tool injection defenses where relevant.

## 11. Acceptance Test for MVP

A complete happy-path test must demonstrate:

```text
Upload 3–5 creator materials
    ↓
Create Source Pack
    ↓
Generate Market Outlook script
    ↓
Human script approval
    ↓
Design carousel
    ↓
Visual QA
    ↓
Human visual approval
    ↓
Export 5-slide carousel
    ↓
Import 4 TikTok CSV categories
    ↓
See dashboard metrics
    ↓
Receive AI performance insight
```

## 12. Definition of Test Success

Do not declare a phase complete just because the application compiles. Relevant acceptance criteria, workflow tests, and critical agent evaluations must pass.
