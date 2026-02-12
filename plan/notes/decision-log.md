# Decision Log

This document records resolved design decisions for the Santokit project. Each entry captures the context, decision, rationale, alternatives considered, and references to relevant specs.

Decisions are recorded chronologically with the most recent first.

---

## 2026-02-10: Bridge-Hub Internal API Logging Exclusion (PR-005)

**Context:** The `/internal/keys` endpoint returns sensitive signing keys for JWT verification. These keys must not appear in logs, traces, or error messages to prevent security leaks.

**Decision:**
- **HTTP middleware layer**: Skip request/response logging for `/internal/keys`
- **OpenTelemetry spans**: Mark spans as non-recording for this endpoint
- **Error logging**: Redact key material from error messages
- Added implementation checklist in spec

**Rationale:**
- Defense-in-depth: Keys never reach log aggregation systems
- Prevents accidental exposure via log forwarding, metrics, or alerts
- Aligns with secrets management best practices (minimize surface area)

**Alternatives Considered:**
1. **Log redaction at aggregation layer** → Rejected (too late, keys already left the system)
2. **Encrypt keys in transit only** → Rejected (doesn't prevent logging)
3. **No logging at all for `/internal/*`** → Rejected (lose operational visibility for other endpoints like `/internal/releases`)

**Implementation:**
- Bridge HTTP middleware checks `request.path == "/internal/keys"` → skip logging
- OTEL SDK marks span as `is_recording = false`
- Error handlers check endpoint and redact before logging

**References:**
- `plan/spec/bridge-hub-protocol.md` Section 1.1.1 (Logging and Tracing Exclusions)
- `plan/spec/observability.md` Section 4.2 (Sensitive Data Filtering)

**Follow-up:**
- [ ] Add integration test verifying keys never in logs
- [ ] Document operator playbook for key rotation

---

## 2026-02-10: Request/Trace/Audit Correlation Rules (PR-004)

**Context:** Operators need to correlate logs (requestId), distributed traces (traceId/spanId), and audit trail (audit detail) across Hub and Bridge for incident investigation.

**Decision:**
- **Bridge request → requestId** (generated at ingress, propagated to DB logs, audit, traces)
- **OpenTelemetry trace → traceId + spanId** (standard OTEL propagation)
- **Audit log entry → includes requestId + traceId** (linkage for forensics)
- Hub API calls from operators also generate requestId

**Correlation Flow:**
```
User Request (Bridge)
  ↓
requestId = uuid()
  ↓
OTEL Span (traceId, spanId) — contains baggage["requestId"]
  ↓
Audit Log Entry — { requestId, traceId, action: "db.select", ... }
  ↓
Application Logs — [requestId=...] Query executed
```

**Rationale:**
- RequestId provides stable identifier across service restarts (unlike traceId which may vary by APM system)
- TraceId enables distributed tracing in Jaeger/Zipkin
- SpanId identifies specific operation within trace
- Audit log with both IDs allows operators to pivot between logging systems

**Alternatives Considered:**
1. **Use traceId only** → Rejected (not all logs have OTEL context, e.g., structured app logs)
2. **Use separate correlationId** → Rejected (redundant with requestId, adds complexity)
3. **Audit log uses spanId only** → Rejected (loses trace-level context)

**Implementation:**
- Bridge middleware generates requestId at ingress
- OTEL baggage propagates requestId to child spans
- Audit logger reads traceId from OTEL context
- Structured logs include requestId field

**References:**
- `plan/spec/observability.md` Section 4.3 (Request Correlation)
- `plan/spec/audit-log.md` Section 3 (Audit Entry Schema)

**Follow-up:**
- [ ] Add Grafana dashboard showing requestId → trace lookup
- [ ] Document operator flow: log search → trace → audit entry

---

## 2026-02-10: Event Payload Validation Error Handling (PR-003)

**Context:** Event handlers may require fields not present in published event payloads. Need to decide where validation fails and how errors are handled.

**Decision:**
- **Publish time validation**: Schema validation at `/events/{topic}/publish` endpoint
  - Missing required fields → **400 SCHEMA_VALIDATION_FAILED** (reject immediately)
- **Handler execution time**: If handler logic fails
  - Runtime errors → **retry with exponential backoff** (max 10 retries)
  - Exhausted retries → **move to DLQ** (Dead Letter Queue)

**Failure Flow:**
```
Client publishes event
  ↓
Bridge validates against topic schema
  ↓
[FAIL] → 400 SCHEMA_VALIDATION_FAILED (event rejected, not persisted)
  ↓
[PASS] → Event persisted to Pub/Sub
  ↓
Handler processes event
  ↓
[FAIL] → Retry (backoff: 1s, 2s, 4s, ..., max 10 times)
  ↓
[Still failing] → DLQ (event preserved for debugging)
```

**Rationale:**
- **Early validation prevents garbage in**: Bad events never enter system, reduces DLQ noise
- **Handler retries support transient failures**: Network blips, temporary DB unavailability
- **DLQ preserves evidence**: Operators can inspect failed events, replay after fixing handler

**Alternatives Considered:**
1. **Validation only at handler execution** → Rejected (pollutes DLQ with preventable errors, wastes resources)
2. **No retries, immediate DLQ** → Rejected (doesn't handle transient failures gracefully)
3. **Block handler registration if schema mismatch** → Rejected (prevents schema evolution, too rigid)
4. **Infinite retries** → Rejected (poison pill events could block queue forever)

**Implementation:**
- Bridge `/events/{topic}/publish` validates payload against `topics.yaml` schema
- Pub/Sub library wraps handler with retry logic (exponential backoff)
- After max_retries (default 10), message moved to `{topic}.dlq`

**References:**
- `plan/spec/events.md` Section 1.3.2 (Event Publishing Validation)
- `plan/spec/events.md` Section 3.4 (Dead Letter Queues)
- `plan/spec/logics.md` Section 5 (Event Handlers)
- `plan/spec/errors.md` (SCHEMA_VALIDATION_FAILED error code)

**Follow-up:**
- [ ] Add CLI command `stk events dlq inspect <event-id>` for debugging
- [ ] Add CLI command `stk events dlq replay <topic> --since <time>` for batch replay
- [ ] Monitor DLQ growth rate, alert if > 100 events/min

---

## 2026-02-10: Cron Expression Specification (PR-002)

**Context:** Cron schedule syntax is ambiguous across implementations (5-field vs 6-field with seconds, 6-field vs 7-field with years).

**Decision:**
- **Standard 5-field cron expression** format only:
  ```
  ┌───────────── minute (0 - 59)
  │ ┌───────────── hour (0 - 23)
  │ │ ┌───────────── day of month (1 - 31)
  │ │ │ ┌───────────── month (1 - 12)
  │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
  │ │ │ │ │
  * * * * *
  ```
- **No seconds field** (minimum granularity: 1 minute)
- **No years field** (not needed for recurring schedules)

**Examples:**
- Every 5 minutes: `*/5 * * * *`
- Daily at 2:30 AM UTC: `30 2 * * *`
- Every Monday at 9 AM UTC: `0 9 * * 1`

**Rationale:**
- **Simplicity**: 5-field is most common, widely understood by developers
- **Sub-minute not needed**: Most cron jobs are periodic tasks (cleanup, sync, reports), not real-time
- **Year field rarely used**: Recurring schedules don't need year specification
- **Alignment with Kubernetes CronJob**: Same syntax for familiarity

**Alternatives Considered:**
1. **6-field with seconds** → Rejected (adds complexity, sub-minute granularity not needed)
2. **7-field with seconds + years** → Rejected (excessive, increases learning curve)
3. **Quartz cron syntax (6-field)** → Rejected (less common, not standard)

**Implementation:**
- Parser validates cron expression has exactly 5 fields
- Bridge rejects cron schedules with non-standard format (error: INVALID_CRON_EXPRESSION)
- CLI validates cron syntax before `stk apply` (early feedback)

**References:**
- `plan/spec/events.md` Section 2.2.1 (Cron Schedules)
- `plan/spec/errors.md` (INVALID_CRON_EXPRESSION error code)

**Follow-up:**
- [ ] Add cron expression validator to `stk validate` command
- [ ] Document cron syntax in operator guide
- [ ] Consider cron helper in CLI: `stk cron explain "*/5 * * * *"` → "Every 5 minutes"

---

## 2026-02-10: Cron Timezone and DST Handling (PR-001)

**Context:** Cron schedules can behave unpredictably across timezones, especially during Daylight Saving Time (DST) transitions (e.g., 2:00 AM doesn't exist on spring-forward day).

**Decision:**
- **All cron schedules use UTC timezone** (fixed, no DST)
- **No per-job timezone configuration**
- Operators must convert local times to UTC when defining schedules

**Example:**
- Want daily backup at 2:00 AM EST (UTC-5)?
- Define as: `0 7 * * *` (7:00 AM UTC)
- Want daily report at 9:00 AM PST (UTC-8)?
- Define as: `0 17 * * *` (5:00 PM UTC)

**Rationale:**
- **Predictability**: UTC has no DST, so schedules run consistently every day
- **Simplicity**: No need to track timezone rules, DST start/end dates
- **Global consistency**: Works across all deployment regions without special handling
- **Alignment with infrastructure**: Kubernetes CronJob, AWS EventBridge, Google Cloud Scheduler all default to UTC

**Edge Case Avoided:**
- DST spring-forward: 2:00 AM doesn't exist (clock jumps to 3:00 AM)
  - With local timezone: `0 2 * * *` would be skipped or run at 3:00 AM (ambiguous)
  - With UTC: No ambiguity, always runs

**Alternatives Considered:**
1. **Per-job timezone config** → Rejected (operational complexity, DST edge cases, testing burden)
2. **System-wide timezone setting** → Rejected (multi-region deployments become confusing)
3. **Let users choose: UTC or local** → Rejected (inconsistent behavior, confusing for teams)

**Implementation:**
- Cron scheduler interprets all expressions as UTC
- Bridge logs cron execution times in UTC
- CLI displays schedule in UTC (with optional local time preview)

**References:**
- `plan/spec/events.md` Section 2.2.1 (Cron Schedules)
- `plan/spec/conventions.md` (Timestamp Handling)

**Follow-up:**
- [ ] Add CLI helper: `stk cron convert --from EST --time "2:00 AM"` → `0 7 * * *`
- [ ] Document timezone conversion examples in operator guide
- [ ] Consider audit log showing "next scheduled run" in both UTC and operator's local time

---

## Decision Template (for future entries)

```markdown
## YYYY-MM-DD: Decision Title (PR-XXX or Issue-XXX)

**Context:** What problem or ambiguity prompted this decision?

**Decision:**
- Clear, actionable statement of what was decided
- Bullet points for multi-part decisions

**Rationale:**
- Why this decision makes sense
- Benefits and trade-offs
- Alignment with project goals or industry standards

**Alternatives Considered:**
1. **Alternative A** → Rejected (reason)
2. **Alternative B** → Rejected (reason)

**Implementation:**
- How the decision will be implemented
- Key technical details

**References:**
- Links to related spec files
- External resources (RFCs, papers, standards)

**Follow-up:**
- [ ] Action items or future work
```

---

## How to Use This Log

### When to Add an Entry

Add a decision to this log when:
- Resolving an item from `open-questions.md`
- Making a significant architectural choice
- Choosing between multiple valid approaches
- Establishing a convention or standard
- Changing a previous decision (include link to old entry)

### When NOT to Add

Don't add trivial decisions:
- Implementation details that don't affect contracts
- Obvious choices with no alternatives
- Decisions that are already documented in specs (avoid duplication)

### Referencing Decisions

When writing specs, reference decisions like:
```markdown
We use UTC for all cron schedules (see decision-log.md PR-001).
```

### Updating Decisions

If a decision is revisited:
1. Add a new entry with date: "YYYY-MM-DD: Reversal of PR-XXX"
2. Explain why the original decision no longer applies
3. Link to the original entry
4. Update affected specs

---

## Index by Topic

### Authentication & Security
- PR-005: Bridge-Hub Internal API Logging Exclusion
- PR-004: Request/Trace/Audit Correlation Rules

### Events & Pub/Sub
- PR-003: Event Payload Validation Error Handling
- PR-002: Cron Expression Specification
- PR-001: Cron Timezone and DST Handling

### Schema & Database
- (Future entries)

### Observability
- PR-005: Bridge-Hub Internal API Logging Exclusion
- PR-004: Request/Trace/Audit Correlation Rules

### Operations
- PR-002: Cron Expression Specification
- PR-001: Cron Timezone and DST Handling
