# KantorKu-AI — Development Rules

## 1. Code Quality

- TypeScript strict mode where practical.
- Avoid `any` unless documented and unavoidable.
- Prefer explicit interfaces/types at module boundaries.
- Keep functions small and composable.
- Validate external input at boundaries.

## 2. Project Structure

Prefer feature-oriented modules with clear boundaries.

```text
agents/
workflows/
content/
analytics/
knowledge/
brands/
trading/
assets/
```

Avoid a giant `utils` directory. Put helpers near the feature they serve unless broadly shared.

## 3. API Rules

- Consistent error envelope.
- Explicit request/response schemas.
- Authentication/authorization at API boundary.
- Pagination for list endpoints that can grow.
- Idempotency support for import/workflow operations.

## 4. Database Rules

- All schema changes through migrations.
- Use foreign keys where integrity requires them.
- Add indexes based on actual query patterns.
- Avoid destructive migrations in routine feature work.
- Prefer timestamps in UTC in storage; convert to user timezone in UI.

## 5. Queue Rules

- Jobs must be idempotent.
- Define timeout and retry behavior.
- Record failure details.
- Avoid duplicate processing.

## 6. AI Rules

- Use structured outputs.
- Version prompts.
- Log model/provider metadata.
- Keep provider-specific code behind a model gateway.
- Never make a business-critical state transition solely from unvalidated free-form model text.

## 7. Content Rules

- Approved script versions are immutable unless explicitly revised.
- Design should consume structured script data.
- Do not hardcode promotion logos/CTAs in templates.
- Templates reference brand/promotion configuration.

## 8. Analytics Rules

- Keep original uploaded CSV files.
- Record parser/mapping version.
- Never discard unknown columns silently.
- Surface mapping errors to the user.
- Never force low-confidence content matches.

## 9. File Upload Rules

- Validate MIME and extension.
- Configure max file size.
- Store checksum.
- Generate safe storage keys.
- Do not execute uploaded files.
- Process images/documents via controlled parsers.

## 10. Security Rules

- Secrets only in environment/secret manager.
- Never commit `.env` with real credentials.
- Use secure cookies/session handling.
- Validate ownership on every user-owned resource.
- Audit sensitive actions.

## 11. UI Rules

- Reuse components.
- Avoid page-specific visual hacks when a component/system rule is appropriate.
- Keep 2.5D Office Mode separate from core business logic.
- Use data-driven agent status.

## 12. Error Handling

Errors should be classified as:

- validation;
- authorization;
- not found;
- conflict;
- provider/transient;
- workflow;
- system.

Show user-friendly messages and preserve diagnostic context server-side.

## 13. Logging

Use structured logging with:

- timestamp;
- level;
- service;
- request ID/correlation ID;
- entity ID where applicable;
- error code.

Never log secrets or sensitive content unnecessarily.

## 14. Testing

Every new business-critical module should include tests appropriate to its risk. See `TESTING.md`.

## 15. Documentation

When behavior, environment variables, database contracts, agent capabilities, or workflow states change, update the relevant docs.
