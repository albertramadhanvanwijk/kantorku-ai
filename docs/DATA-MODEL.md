# KantorKu-AI — Data Model

## 1. Design Principles

- Preserve raw source data.
- Preserve provenance.
- Version mutable artifacts.
- Separate user-owned business data from operational logs.
- Keep analytics imports reprocessable.

## 2. Core Entities

### users
User/account identity.

### profiles
Creator profile, bio, content preferences.

### trading_profiles
Trading DNA, framework, terminology, risk philosophy.

### brands
Main brand and promotion brands.

### brand_assets
Logos, fonts references, visual assets, usage rules.

### campaigns
Promotion/editorial campaigns.

### campaign_assets
Assets and CTA configurations connected to campaigns.

### content_projects
Top-level content project.

Suggested fields:

- id
- title
- category
- objective
- status
- campaign_id
- created_by
- created_at
- updated_at

### content_versions
Immutable-ish version records for content.

Fields:

- id
- content_project_id
- version_number
- content_type
- script_status
- lock_state
- created_by
- created_at

### content_slides
Structured slide content/design state.

Fields:

- id
- content_version_id
- slide_number
- template_id
- semantic_content
- visual_spec
- rendered_asset_id
- qa_status

### content_sources
Sources attached to content versions.

Fields:

- content_version_id
- source_type
- source_reference
- provenance_metadata

## 3. Creator Materials

### creator_materials
Original user-provided assets/text.

Fields:

- id
- type
- file_asset_id
- title
- metadata
- created_at

### source_packs
Logical grouping of materials.

### source_pack_items
Join table between Source Pack and materials.

## 4. Trading

### trades
Trade records.

Suggested fields:

- instrument
- direction
- entry
- exit
- stop_loss
- take_profit
- result
- timeframe
- opened_at
- closed_at
- notes

### trading_journals
Higher-level journal entry.

### trading_journal_analysis
AI-generated structured analysis tied to journal version/source.

### market_outlooks
Structured market outlook records.

## 5. Agents / Workflow

### agent_definitions
Versioned definitions of agents.

### agent_runs
Operational record of each run.

Fields:

- agent_definition_id
- model_provider
- model_name
- prompt_version
- status
- started_at
- completed_at
- usage_metadata
- error_metadata

### workflow_executions
Top-level execution.

### workflow_steps
Each state/step execution.

### approvals
Human approval decisions.

### tool_runs
Operational tool calls tied to an agent run.

## 6. Templates

### carousel_templates
Template families.

### carousel_template_versions
Versioned layout definitions.

Fields:

- category
- name
- layout_schema
- preview_asset_id
- version
- active

## 7. Analytics

### analytics_imports
One upload/import event.

Fields:

- source = TikTok Studio
- category = Ikhtisar/Konten/Pemirsa/Pengikut
- file_asset_id
- schema_version
- imported_at
- row_count
- validation_status

### analytics_raw_rows
Optional raw normalized representation retaining source values.

### tiktok_account_metrics
Account-level metrics from Ikhtisar.

### tiktok_content_metrics
Content-level metrics from Konten.

### tiktok_audience_metrics
Audience metrics from Pemirsa.

### tiktok_follower_metrics
Follower/growth metrics from Pengikut.

### content_analytics_links
Mapping between TikTok content records and KantorKu-AI content projects.

## 8. Knowledge

### knowledge_documents
Documents/notes/records.

### knowledge_chunks
Chunked text for semantic search.

### knowledge_embeddings
Vector representation where applicable.

### knowledge_provenance
Source, version, and relationship metadata.

## 9. Assets

### file_assets
Generic object storage metadata.

Fields:

- id
- storage_key
- mime_type
- file_size
- checksum
- original_name
- created_at

## 10. Audit / Observability

### audit_events
User and system actions.

### agent_events
Operational timeline events.

## 11. Important Relationships

```text
User
 ├── Profile
 ├── Trading Profile
 ├── Brands
 ├── Campaigns
 ├── Content Projects
 ├── Creator Materials
 └── Trades

Content Project
 ├── Content Versions
 ├── Source Packs
 ├── Campaign
 └── Analytics Links

Source Pack
 └── Creator Materials

Content Version
 ├── Slides
 ├── Sources
 ├── Approvals
 └── Agent Runs

TikTok Analytics Import
 ├── Account Metrics
 ├── Content Metrics
 ├── Audience Metrics
 └── Follower Metrics
```

## 12. Versioning Rule

Prefer append-only/versioned records for scripts, designs, prompts, templates, brand configuration snapshots, and analytics mapping definitions.

## 13. Retention

Raw CSVs and source materials should be retained until explicit user deletion. Operational logs can have configurable retention later.
