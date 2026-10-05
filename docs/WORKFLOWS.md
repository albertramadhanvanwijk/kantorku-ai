# KantorKu-AI — Workflows & State Machines

## 1. General State Principles

Every long-running workflow has:

- project ID;
- execution ID;
- state;
- step history;
- timestamps;
- retry count;
- errors;
- actor (user/agent/system).

## 2. Content Workflow

```text
IDEA
 ↓
MATERIAL_INTAKE (optional)
 ↓
SOURCE_PACK_READY
 ↓
RESEARCH
 ↓
ANALYSIS
 ↓
BRIEF_READY
 ↓
SCRIPT_DRAFT
 ↓
HUMAN_SCRIPT_REVIEW
 ├── REJECT/REVISION → SCRIPT_DRAFT
 └── APPROVE → SCRIPT_LOCKED
 ↓
DESIGN
 ↓
VISUAL_QA
 ├── FAIL → DESIGN
 └── PASS → HUMAN_VISUAL_REVIEW
        ├── REJECT/REVISION → DESIGN
        └── APPROVE → READY_TO_UPLOAD
 ↓
MANUAL_TIKTOK_PUBLISH
 ↓
ANALYTICS_IMPORT
 ↓
PERFORMANCE_ANALYSIS
```

## 3. Script Lock Rules

After `SCRIPT_LOCKED`:

- design may not materially rewrite content;
- content edits require a revision action;
- revision creates a new content version;
- approval must be obtained again if substantive content changes.

## 4. Creator Material Workflow

```text
UPLOAD
 ↓
VALIDATE
 ↓
CLASSIFY
 ↓
EXTRACT_METADATA
 ↓
SOURCE_PACK
 ↓
READY
```

Multiple materials may be added before `SOURCE_PACK_READY`.

## 5. Market Outlook Workflow

```text
Source Pack
 ↓
Chart metadata extraction
 ↓
Multi-timeframe grouping
 ↓
Creator thesis extraction
 ↓
AI observation
 ↓
Market context
 ↓
Scenario synthesis
 ↓
Content brief
```

The output must clearly separate:

- creator thesis;
- factual market context;
- AI observation;
- scenario/possibility.

## 6. Transform My Analysis

```text
Creator Material
 ↓
Preserve creator thesis
 ↓
Structure
 ↓
Simplify language
 ↓
Script
```

## 7. Analyze My Charts

```text
Creator Material
 ↓
Independent AI analysis
 ↓
AI observations
 ↓
Potential content angles
 ↓
User selection
 ↓
Script
```

## 8. Analytics Import Workflow

```text
CSV UPLOAD
 ↓
FILE TYPE DETECTION
 ↓
CATEGORY DETECTION
 ├── IKHTISAR
 ├── KONTEN
 ├── PEMIRSA
 └── PENGIKUT
 ↓
SCHEMA MAPPING
 ↓
VALIDATION
 ↓
DUPLICATE CHECK
 ↓
RAW ARCHIVE
 ↓
NORMALIZED DATA
 ↓
DERIVED METRICS
 ↓
AI INSIGHTS
```

## 9. Analytics Mapping Recovery

If content matching is uncertain:

```text
AUTO MATCH
 ├── HIGH CONFIDENCE → import
 ├── MEDIUM → user confirmation
 └── LOW → leave unmatched
```

Never force an uncertain match.

## 10. Campaign Workflow

```text
CAMPAIGN_DRAFT
 ↓
CAMPAIGN_ACTIVE
 ↓
CONTENT_ASSOCIATED
 ↓
CONTENT_PUBLISHED_MANUALLY
 ↓
ANALYTICS_IMPORTED
 ↓
CAMPAIGN_ANALYSIS
 ↓
CAMPAIGN_CLOSED
```

## 11. Retry / Recovery

Retry only failed/retriable steps.

```text
STEP_FAILED
 ↓
CHECK_RETRY_POLICY
 ├── RETRIABLE → RETRY
 └── NON_RETRIABLE → ERROR_REVIEW
```

The workflow should resume from the last successful checkpoint.

## 12. Idempotency

Repeated queue delivery must not create duplicate:

- content versions;
- analytics imports;
- agent runs;
- asset records;
- approval actions.

## 13. Approval Decision Model

Approval record should contain:

- approver;
- decision;
- timestamp;
- version approved;
- optional note.

## 14. Final Publication State

MVP ends at `READY_TO_UPLOAD`. The creator manually uploads to TikTok. The product should never imply that TikTok publication occurred unless the user confirms it or a future official integration explicitly verifies it.
