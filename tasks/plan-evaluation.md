# Plan Evaluation & Improvement Recommendations

Date: 2026-02-10

## Overall Assessment

**Strengths:**
- ✅ Comprehensive spec coverage (17 spec files, 3500+ lines, well-structured)
- ✅ Clear separation of concerns (spec, implement, flows, notes)
- ✅ Good use of glossary, conventions, and errors catalog
- ✅ Recent additions (events/cron, bridge-hub protocol, observability) are thorough
- ✅ Explicit "open questions" tracking prevents spec bloat
- ✅ Consistent terminology and cross-references

**Current Documentation Structure:**
```
plan/
├── spec/          # 17 spec files (final.md, auth.md, crud.md, schema.md, etc.)
├── implement/     # Implementation details (stack.md)
├── flows/         # User/operator flows (5 files)
├── notes/         # Decision notes (open-questions.md)
├── overview/      # Context (context.md)
└── secrets/       # Secrets model (model.md)
```

---

## Improvement Recommendations

### 1. Cross-Reference & Dependency Mapping ⚠️ P0

**Problem:** Specs reference each other extensively, but there's no visual map of dependencies or recommended reading order.

**Impact:** New team members or contributors don't know where to start. Circular references are hard to detect.

**Recommendation:**
Create `plan/spec/ARCHITECTURE.md`:

```markdown
# Architecture Overview

## Spec Reading Order (Recommended)

### Tier 1: Foundation (Read First)
1. `glossary.md` — Common terminology
2. `conventions.md` — Naming standards
3. `errors.md` — Error catalog
4. `final.md` — Overall system design

### Tier 2: Core Components
5. `schema.md` — Schema management
6. `auth.md` — Authentication & authorization
7. `crud.md` — Auto CRUD operations
8. `logics.md` — Custom SQL logic

### Tier 3: Advanced Features
9. `storage.md` — File storage
10. `events.md` — Pub/Sub & Cron
11. `operator-rbac.md` — Operator permissions
12. `client-sdk.md` — Client libraries

### Tier 4: Operations
13. `bridge-hub-protocol.md` — Internal communication
14. `observability.md` — Metrics, logs, traces
15. `audit-log.md` — Audit logging
16. `cli.md` — CLI interface
17. `mcp.md` — MCP integration

## Component Dependency Graph

```
                    ┌─────────────┐
                    │  glossary   │
                    │ conventions │
                    │   errors    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   final.md  │
                    │ (main spec) │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ schema  │       │  auth   │       │  crud   │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │   events    │
                    │  storage    │
                    │   logics    │
                    └─────────────┘
```

## Spec Maturity Status

| Spec | Status | Last Updated | Completeness |
|------|--------|--------------|--------------|
| final.md | Stable | 2026-02-10 | 95% |
| glossary.md | Stable | 2026-02-10 | 100% |
| conventions.md | Stable | 2026-02-10 | 100% |
| errors.md | Stable | 2026-02-10 | 90% |
| schema.md | Stable | 2026-02-10 | 85% |
| crud.md | Stable | 2026-02-10 | 90% |
| auth.md | Stable | 2026-02-10 | 90% |
| events.md | Stable | 2026-02-10 | 85% |
| bridge-hub-protocol.md | Stable | 2026-02-10 | 90% |
| observability.md | Stable | 2026-02-10 | 85% |
| logics.md | Stable | 2026-02-10 | 80% |
| storage.md | Draft | — | 70% |
| operator-rbac.md | Draft | — | 75% |
| audit-log.md | Stable | 2026-02-10 | 85% |
| cli.md | Draft | — | 60% |
| client-sdk.md | Draft | — | 70% |
| mcp.md | Draft | — | 75% |
```

**Effort:** 2-3 hours
**Impact:** High — Significantly improves onboarding and navigation

---

### 2. Schema Evolution & Migration Strategy ⚠️ P0

**Problem:** `schema.md` covers DDL plan/apply but lacks:
- How to handle live traffic during schema changes
- Zero-downtime migration strategies
- Backward compatibility guarantees for Bridge
- Column deprecation lifecycle

**Impact:** Production incidents during schema changes, Bridge version mismatches causing failures.

**Recommendation:**
Create `plan/spec/schema-evolution.md`:

**Outline:**
```markdown
# Schema Evolution Strategy

## 1. Migration Patterns

### 1.1 Additive Changes (Safe)
- Adding new tables
- Adding nullable columns
- Adding indexes (with CONCURRENTLY)

### 1.2 Expand-Contract Pattern (Breaking)
Step 1 (Expand): Add new column, keep old
Step 2 (Migrate): Dual-write to both columns
Step 3 (Contract): Remove old column after all clients migrated

### 1.3 Column Rename/Type Change
- Use expand-contract with application-level migration
- Bridge version compatibility window: 30 days minimum

## 2. Zero-Downtime Strategy

### 2.1 Schema Lock Protocol
- Schema changes require `--migration-window` flag
- Hub checks active Bridge versions before allowing breaking changes
- Warning if any Bridge instance < minimum compatible version

### 2.2 Release Coordination
```
stk apply --env prod --check-bridge-versions
Bridge v2.1 (compatible: ✅)
Bridge v1.9 (compatible: ⚠️  — upgrade required for column removal)
Proceed? [y/N]
```

## 3. Compatibility Matrix

| Schema Change | Bridge Compatibility | Downtime Required |
|---------------|---------------------|-------------------|
| Add table | All versions | No |
| Add nullable column | All versions | No |
| Add required column | v2.0+ | No (with default) |
| Remove column | v2.1+ | No (if unused) |
| Rename column | v2.1+ with mapping | No |
| Change column type | v2.2+ | Maybe |
| Drop table | v2.2+ | No (if unused) |

## 4. Deprecation Lifecycle

Phase 1: Mark deprecated (warn in logs)
Phase 2: Disable in new releases (block new usage)
Phase 3: Remove from schema (after sunset date)

Minimum deprecation period: 90 days for breaking changes
```

**Effort:** 4-6 hours
**Impact:** High — Critical for production operations

---

### 3. Error Recovery Playbooks ⚠️ P1

**Problem:** `errors.md` defines error codes but operators don't have runbooks for diagnosis/resolution.

**Impact:** Longer MTTR (Mean Time To Recovery), inconsistent incident response.

**Recommendation:**
Create `plan/flows/incident-response.md`:

**Outline:**
```markdown
# Incident Response Playbooks

## Quick Reference

| Error Code | Severity | MTTR Target |
|------------|----------|-------------|
| UNAUTHORIZED | P3 | < 5 min |
| FORBIDDEN | P3 | < 10 min |
| NOT_FOUND | P4 | < 5 min |
| INTERNAL_ERROR | P1 | < 30 min |
| SERVICE_UNAVAILABLE | P1 | < 15 min |
| SCHEMA_VALIDATION_FAILED | P3 | < 10 min |

---

## UNAUTHORIZED (401)

### Symptoms
- Clients receiving 401 responses
- Logs show "invalid token" or "expired token"

### Common Causes
1. End User access token expired (TTL: 1 hour by default)
2. API key revoked or invalid
3. Clock skew between client and server (> 5 minutes)
4. Signing key rotation in progress

### Diagnostic Commands
```bash
# Check token validity
stk auth verify-token --token <token>

# Check API key status
stk apikeys list --project <project> --env <env>

# Check signing keys
stk keys list --project <project> --env <env>

# Check Bridge key sync status
stk bridge status --show-keys
```

### Resolution Steps
1. **If token expired:**
   - Client should refresh token using refresh_token grant
   - Check if refresh token endpoint is accessible

2. **If API key revoked:**
   - Issue new API key: `stk apikeys create`
   - Update client configuration

3. **If signing key issue:**
   - Check key rotation status: `stk keys status`
   - Wait for Bridge to sync (max 30s polling interval)
   - Force sync: `stk bridge force-sync --project <p> --env <e>`

4. **If clock skew:**
   - Check NTP sync on client: `timedatectl status`
   - Verify server time: `stk hub time`

### Escalation Criteria
- Token refresh fails after 3 attempts → P2 incident
- Multiple projects affected → P1 incident
- Hub signing key service down → P0 incident

---

## INTERNAL_ERROR (500)

### Symptoms
- Bridge returning 500 errors
- Hub admin APIs failing
- SQL execution errors in logs

### Common Causes
1. Database connection pool exhausted
2. SQL query timeout
3. Permission evaluation error (CEL parsing)
4. Release payload corrupted
5. Dependency service down (Hub, DB)

### Diagnostic Commands
```bash
# Check Bridge health
curl https://bridge.example.com/healthz
curl https://bridge.example.com/readyz

# Check database connections
stk connections test --project <project> --env <env>

# Check release status
stk releases current --project <project> --env <env>

# Check recent errors (last 1 hour)
stk logs bridge --level error --since 1h --project <project>

# Check metrics
stk metrics bridge --metric db_pool_active,db_pool_idle
```

### Resolution Steps
1. **DB pool exhausted:**
   - Scale Bridge instances horizontally
   - Increase pool size: `STK_DB_POOL_MAX_SIZE`
   - Check for connection leaks

2. **SQL timeout:**
   - Identify slow queries: `stk logs bridge --filter "duration > 5000"`
   - Add indexes to schema
   - Optimize Custom Logic SQL

3. **CEL evaluation error:**
   - Review recent permission changes: `stk audit log --action permissions.apply`
   - Test CEL expressions: `stk permissions test-cel --expr "..."`
   - Rollback permissions: `stk release rollback --to <previous-release-id>`

4. **Release payload corrupted:**
   - Check release integrity: `stk releases verify <release-id>`
   - Rollback release: `stk release rollback --env <env>`

### Escalation Criteria
- Error rate > 5% for 5 minutes → P1 incident
- Hub unreachable → P0 incident
- Data corruption suspected → P0 incident + freeze changes

---

## SERVICE_UNAVAILABLE (503)

### Symptoms
- Bridge rejecting requests with 503
- `/readyz` endpoint failing
- "stale release cache" in logs

### Common Causes
1. Hub unreachable (network, Hub down)
2. Release cache expired (> max_stale threshold)
3. Signing keys sync failed
4. DB connection failed (initial bootstrap)

### Diagnostic Commands
```bash
# Check Bridge readiness
curl https://bridge.example.com/readyz

# Check Hub health
curl https://hub.example.com/healthz

# Check release cache status
stk bridge status --show-cache-age

# Check last successful Hub sync
stk bridge logs --filter "hub_poll" --limit 10

# Network connectivity test
stk bridge test-hub-connectivity
```

### Resolution Steps
1. **Hub unreachable:**
   - Check Hub status: `stk hub status`
   - Check network policies/firewall rules
   - Check service token validity: `STK_BRIDGE_TOKEN`

2. **Release cache expired:**
   - Default max_stale: 1 hour
   - Bridge serves stale data until Hub recovers
   - If Hub back online, cache auto-refreshes in < 30s
   - Manual refresh: `stk bridge force-sync`

3. **Initial bootstrap failure:**
   - Check required env: `STK_HUB_URL`, `STK_BRIDGE_TOKEN`
   - Check Hub has release for project/env
   - Verify connection configuration exists

### Escalation Criteria
- Hub down > 30 minutes → P0 incident
- Bridge can't bootstrap → P1 incident
- Multiple envs affected → P1 incident

---

## SCHEMA_VALIDATION_FAILED (400)

### Symptoms
- Event publish failures
- "Missing required field" errors
- Pub/Sub DLQ filling up

### Common Causes
1. Event payload missing required fields
2. Schema evolution incompatibility
3. Type mismatch (string vs number)
4. Publisher using outdated schema version

### Diagnostic Commands
```bash
# Check topic schema
stk events topic get <topic-name>

# Check recent publish failures
stk events dlq list --topic <topic-name> --limit 20

# Inspect failed event
stk events dlq inspect <event-id>

# Check schema versions
stk releases compare <old-release-id> <new-release-id> --section events
```

### Resolution Steps
1. **Field missing:**
   - Check publisher code
   - Make field optional: Update topic schema `required: false`
   - Add default value in schema

2. **Schema evolution issue:**
   - Review schema changes: `stk audit log --action schema.apply`
   - Rollback schema: `stk release rollback`
   - Use expand-contract pattern for breaking changes

3. **Type mismatch:**
   - Fix publisher to send correct type
   - Or update schema type definition

4. **DLQ processing:**
   - Review DLQ: `stk events dlq list`
   - Replay after fix: `stk events dlq replay --topic <topic> --since <time>`
   - Purge invalid: `stk events dlq purge --topic <topic> --before <time>`

### Escalation Criteria
- DLQ growth rate > 100/min → P2 incident
- Critical business event failing → P1 incident
```

**Effort:** 6-8 hours
**Impact:** High — Dramatically reduces MTTR

---

### 4. Capacity Planning & Limits ⚠️ P1

**Problem:** No documented system limits or capacity guidelines. Operators don't know when to scale.

**Impact:** Unexpected failures when hitting undocumented limits, over-provisioning, or under-provisioning.

**Recommendation:**
Create `plan/spec/limits.md`:

**Outline:**
```markdown
# System Limits & Capacity Planning

## 1. Hard Limits (Enforced)

### Hub (Control Plane)

| Resource | Limit | Configurable | Error Code |
|----------|-------|--------------|------------|
| Orgs per instance | 1,000 | No | CONFLICT |
| Teams per org | 100 | No | CONFLICT |
| Projects per org | 500 | No | CONFLICT |
| Envs per project | 10 | No | CONFLICT |
| Connections per project | 10 | Yes | CONFLICT |
| Tables per connection | 500 | Yes | BAD_REQUEST |
| Columns per table | 200 | Yes | BAD_REQUEST |
| API keys per project | 100 | No | CONFLICT |
| Audit log retention | 90 days | Yes | — |
| Release history per env | 1,000 | No | — |

### Bridge (Data Plane)

| Resource | Limit | Configurable | Error Code |
|----------|-------|--------------|------------|
| Concurrent requests | 10,000 | Yes | TOO_MANY_REQUESTS |
| Request body size | 10 MB | Yes | BAD_REQUEST |
| Response body size | 50 MB | Yes | INTERNAL_ERROR |
| Query timeout | 30s | Yes | INTERNAL_ERROR |
| DB connection pool size | 100 per connection | Yes | SERVICE_UNAVAILABLE |
| Rate limit (per API key) | 1,000 req/min | Yes | TOO_MANY_REQUESTS |
| Rate limit (per End User) | 100 req/min | Yes | TOO_MANY_REQUESTS |
| Expansion depth (FK) | 3 levels | Yes | BAD_REQUEST |
| Result set size | 10,000 rows | Yes | BAD_REQUEST |
| WHERE clause complexity | 50 conditions | Yes | BAD_REQUEST |

### Events (Pub/Sub)

| Resource | Limit | Configurable | Error Code |
|----------|-------|--------------|------------|
| Topics per project | 100 | No | CONFLICT |
| Subscriptions per topic | 50 | No | CONFLICT |
| Event payload size | 1 MB | Yes | BAD_REQUEST |
| Event retention | 7 days | Yes | — |
| Publish rate | 10,000/min per topic | Yes | TOO_MANY_REQUESTS |
| Handler timeout | 30s | Yes | INTERNAL_ERROR |
| Max retries | 10 | Yes | — |
| DLQ retention | 14 days | Yes | — |

### Storage

| Resource | Limit | Configurable | Error Code |
|----------|-------|--------------|------------|
| Buckets per project | 50 | No | CONFLICT |
| File size (presigned upload) | 5 GB | Yes | BAD_REQUEST |
| Presigned URL TTL | 1 hour | Yes | — |

## 2. Soft Limits (Warnings)

| Resource | Warning Threshold | Recommendation |
|----------|------------------|----------------|
| DB connection pool usage | > 80% | Scale horizontally or increase pool |
| Query duration | > 5s | Add indexes, optimize query |
| Release cache age | > 5 minutes | Check Hub connectivity |
| Audit log growth | > 1M entries/day | Adjust retention or export |
| DLQ size | > 1,000 events | Investigate subscription failures |

## 3. Capacity Planning Guidelines

### Bridge Sizing

**Rule of thumb:**
- 1 Bridge instance (2 vCPU, 4 GB RAM) handles:
  - ~500 req/s (simple CRUD)
  - ~200 req/s (with FK expansion)
  - ~50 concurrent long-running queries

**DB Connection Pool Sizing:**
```
pool_size = (vCPU * 2) + effective_spindle_count
For cloud DBs: pool_size = vCPU * 4
```

**Scaling triggers:**
- CPU > 70% sustained for 5 minutes → scale up
- Request latency p95 > 500ms → scale up or optimize queries
- DB pool saturation > 80% → increase pool or scale horizontally

### Hub Sizing

**Rule of thumb:**
- 1 Hub instance (2 vCPU, 4 GB RAM) handles:
  - ~50 concurrent operators
  - ~1,000 schema applies/day
  - ~10,000 audit log writes/day

**Scaling triggers:**
- Schema apply duration > 30s → investigate DB performance
- Audit log write lag > 10s → scale Hub DB

### Storage (S3)

**Presigned URL generation:**
- Virtually unlimited (stateless operation)
- Latency: < 10ms

**Bandwidth:**
- Per-bucket: 3,500 PUT/s, 5,500 GET/s (S3 standard)
- If exceeding, use bucket sharding: `bucket-{hash(userId) % 10}`

## 4. Monitoring & Alerting

### Critical Metrics

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| `stk_bridge_request_duration_seconds{p95}` | > 1s | Investigate slow queries |
| `stk_bridge_db_pool_active / max` | > 0.8 | Scale or increase pool |
| `stk_bridge_permission_denials_total` | > 100/min | Check permission config |
| `stk_bridge_release_cache_age_seconds` | > 300 | Check Hub connectivity |
| `stk_hub_schema_applies_total{result=failure}` | > 5/hour | Check destructive changes |
| `stk_hub_releases_created_total` | Sudden spike | Possible automated misconfig |

### Dashboards

Grafana templates: `plan/observability/dashboards/`
```

**Effort:** 4-5 hours
**Impact:** High — Prevents capacity incidents, guides scaling decisions

---

### 5. Testing Strategy ⚠️ P1

**Problem:** Specs mention "test scenarios" but there's no consolidated test strategy or coverage targets.

**Impact:** Untested edge cases, regressions, inconsistent test quality across modules.

**Recommendation:**
Create `plan/implement/testing.md`:

**Outline:**
```markdown
# Testing Strategy

## 1. Test Pyramid

```
      ┌─────────────┐
      │     E2E     │  10%  (Full flow, real DB)
      └─────────────┘
     ┌───────────────┐
     │  Integration  │  30%  (Multi-component, test DB)
     └───────────────┘
    ┌─────────────────┐
    │      Unit       │  60%  (Single function, mocked)
    └─────────────────┘
```

## 2. Coverage Targets

| Component | Unit | Integration | E2E | Total Target |
|-----------|------|-------------|-----|--------------|
| core (parser) | 90% | 10% | — | 90% |
| sql (query gen) | 85% | 15% | — | 85% |
| bridge | 70% | 25% | 5% | 80% |
| hub | 70% | 25% | 5% | 80% |
| cli | 60% | 30% | 10% | 75% |

## 3. Unit Tests

**Location:** `packages/*/tests/unit/`

**Scope:**
- Schema YAML parsing
- SQL query generation (SeaQuery)
- CEL expression evaluation
- Permission rule matching
- Request validation

**Example:**
```rust
#[test]
fn test_parse_table_schema() {
    let yaml = r#"
      name: users
      columns:
        - name: id
          type: uuid
          primaryKey: true
    "#;
    let table = parse_table_yaml(yaml).unwrap();
    assert_eq!(table.name, "users");
    assert_eq!(table.columns.len(), 1);
}
```

## 4. Integration Tests

**Location:** `packages/*/tests/integration/`

**Scope:**
- Bridge + Test DB (schema apply + CRUD)
- Hub + Test DB (release management)
- CLI + Mock Hub API
- Event publish + subscription handler

**Fixtures:**
Test project layouts in `tests/fixtures/`:
```
fixtures/
├── basic_crud/          # Simple table, CRUD only
├── column_permissions/  # Column-level ACL
├── fk_expansion/        # Foreign key relationships
├── custom_logic/        # SQL functions
├── pub_sub/             # Event topics + subscriptions
└── storage/             # S3 presigned URLs
```

**Example:**
```rust
#[tokio::test]
async fn test_crud_with_permissions() {
    let fixture = load_fixture("column_permissions").await;
    let bridge = spawn_test_bridge(fixture).await;

    // Insert as admin (all columns allowed)
    let res = bridge.call("/db/users/insert", admin_key, json!({
        "name": "Alice",
        "email": "alice@example.com",
        "internal_notes": "VIP"
    })).await;
    assert_eq!(res.status(), 200);

    // Query as regular user (internal_notes hidden)
    let res = bridge.call("/db/users/select", user_key, json!({
        "where": {"name": "Alice"}
    })).await;
    let data = res.json::<SelectResponse>().await.data;
    assert!(data[0].get("internal_notes").is_none());
}
```

## 5. E2E Tests

**Location:** `tests/e2e/`

**Scope:**
- Full operator workflow: `stk init` → `stk apply` → verify Bridge
- GitOps flow: commit → CI → `stk apply` → `stk release promote`
- End-user authentication: signup → login → CRUD → refresh token
- Schema evolution: add column → deploy → verify backward compat

**Test Scenarios (mapped to `plan/flows/`):**

| Flow | Test Scenario | Fixture |
|------|---------------|---------|
| flows/operator.md | Bootstrap new project | e2e/bootstrap |
| flows/crud.md | CRUD with FK expansion | e2e/fk_expansion |
| flows/auth.md | End User signup + CRUD | e2e/auth_flow |
| flows/logics.md | Custom SQL transaction | e2e/purchase_logic |
| flows/security.md | Permission bypass attempt | e2e/security_tests |

## 6. Contract Tests (Hub ↔ Bridge)

**Location:** `tests/contracts/`

**Tool:** Pact or custom JSON schema validation

**Contracts:**
- `GET /internal/releases/current`
- `GET /internal/releases/{releaseId}`
- `GET /internal/keys/{project}/{env}`

**Example:**
```rust
#[test]
fn test_release_payload_schema() {
    let hub_response = mock_hub_release_response();
    let schema = load_contract_schema("release_payload_v1.json");
    assert!(validate_json_schema(&hub_response, &schema).is_ok());
}
```

## 7. Chaos Testing

**Location:** `tests/chaos/`

**Scenarios:**
1. **Hub Downtime:**
   - Bridge serves from cache (stale < max_stale)
   - Bridge rejects requests (stale > max_stale)

2. **DB Connection Loss:**
   - Bridge retries with backoff
   - Returns 503 after max retries

3. **Slow Queries:**
   - Query timeout enforced
   - Connection returned to pool

4. **Release Payload Corruption:**
   - Bridge detects invalid schema
   - Falls back to last valid release

**Tools:**
- toxiproxy (network chaos)
- Docker Compose (service orchestration)

## 8. Performance Tests

**Location:** `tests/performance/`

**Tool:** k6, Grafana k6

**Scenarios:**
```javascript
// Load test: 1000 req/s for 5 minutes
export let options = {
  stages: [
    { duration: '1m', target: 500 },
    { duration: '3m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
  },
};
```

**Targets:**
- CRUD p95 latency < 200ms (no FK expansion)
- CRUD p95 latency < 500ms (with FK expansion)
- Custom Logic p95 latency < 1s
- Schema apply < 10s (100 tables)

## 9. Test Data Management

**Strategy:**
- **Unit/Integration:** Use factories (e.g., `FactoryBot` pattern)
- **E2E:** Seed with `fixtures/*.sql`
- **Performance:** Generate with `faker` libraries

**Cleanup:**
- Unit/Integration: Rollback transactions
- E2E: Drop test DB after run
- CI: Isolated DB per test run

## 10. CI/CD Integration

**Pipeline:**
```yaml
stages:
  - lint
  - unit-test
  - integration-test
  - e2e-test
  - security-scan
  - build
  - deploy

unit-test:
  script: cargo test --lib
  coverage: 80%

integration-test:
  services:
    - postgres:15
  script: cargo test --test integration

e2e-test:
  services:
    - postgres:15
  script: ./scripts/run-e2e-tests.sh
```

**Coverage Reports:**
- Tool: `cargo-tarpaulin` (Rust), `c8` (TypeScript)
- Upload to: Codecov or SonarQube
- Block PR if coverage drops > 2%
```

**Effort:** 6-8 hours
**Impact:** High — Establishes quality baseline, prevents regressions

---

### 6. Security Threat Model ⚠️ P1

**Problem:** `plan/flows/security.md` (3569 lines) exists but lacks formal threat modeling.

**Impact:** Unidentified attack vectors, inconsistent security controls.

**Recommendation:**
Expand `plan/flows/security.md` with STRIDE analysis:

**Addition to security.md:**
```markdown
# Threat Model (STRIDE Analysis)

## Spoofing

### Threat: Attacker impersonates Operator
**Attack Vector:**
- Stolen CLI credentials (`~/.santokit/credentials`)
- Compromised CI/CD pipeline with `stk` access

**Mitigations:**
- [ ] Encrypt credentials at rest (OS keychain)
- [ ] Short-lived tokens (1 hour TTL)
- [ ] MFA for sensitive operations (`stk apply --env prod`)
- [ ] Audit log all Hub operations (actor tracking)

### Threat: Attacker impersonates End User
**Attack Vector:**
- Stolen access token (XSS, local storage leak)
- Replay attack (captured token)

**Mitigations:**
- [ ] HttpOnly cookies (SSR apps)
- [ ] Short-lived tokens (1 hour access, 7 day refresh)
- [ ] Token binding (IP, device fingerprint)
- [ ] Rotate signing keys quarterly

### Threat: Attacker impersonates Bridge
**Attack Vector:**
- Stolen service token (`STK_BRIDGE_TOKEN`)
- Network-level MITM

**Mitigations:**
- [ ] Service token rotation (90 days)
- [ ] mTLS for Bridge ↔ Hub (future)
- [ ] `/internal/*` network isolation (VPC, firewall)

---

## Tampering

### Threat: Release payload modified in transit
**Attack Vector:**
- MITM on Hub → Bridge communication
- Compromised Bridge instance modifies cache

**Mitigations:**
- [ ] TLS 1.3 required for all Hub API calls
- [ ] Release payload integrity (HMAC signature)
- [ ] Bridge verifies signature before caching

### Threat: Schema tampered in Git before `stk apply`
**Attack Vector:**
- Malicious PR merged without review
- Compromised developer account

**Mitigations:**
- [ ] Git branch protection (require reviews)
- [ ] Schema drift detection (Hub compares snapshot)
- [ ] Destructive change warnings (`--force` required)

---

## Repudiation

### Threat: Operator denies making destructive change
**Attack Vector:**
- Shared credentials (team account)
- Logs tampered or deleted

**Mitigations:**
- [ ] Audit log immutability (append-only table, no DELETE)
- [ ] Audit log backup to S3 (daily)
- [ ] Individual operator accounts (no shared credentials)
- [ ] Include `requestId` in all audit entries (correlation)

---

## Information Disclosure

### Threat: Secrets leaked in logs/traces
**Attack Vector:**
- DB URL logged on error
- API key in error message
- `/internal/keys` response in trace

**Mitigations:**
- [x] Sensitive info filtering (observability.md Section 4.2)
- [x] `/internal/keys` excluded from logs/traces (bridge-hub-protocol.md)
- [ ] Redact connection strings in error messages
- [ ] Secrets never in Git (Hub-managed only)

### Threat: Schema info exposed to unauthorized user
**Attack Vector:**
- End User queries table/column list
- Error messages reveal schema details

**Mitigations:**
- [ ] MCP server requires operator authentication
- [ ] Generic error messages to End Users (no table names)
- [ ] Schema introspection disabled by default

---

## Denial of Service

### Threat: Resource exhaustion via API abuse
**Attack Vector:**
- Unbounded SELECT (fetch all rows)
- Expensive FK expansion (N+1 query bomb)
- Pub/Sub event flood

**Mitigations:**
- [x] Rate limits per API key / End User (limits.md)
- [x] Query timeout (30s default)
- [x] Result set limit (10,000 rows max)
- [x] FK expansion depth limit (3 levels)
- [ ] Cost-based query rejection (query planner analysis)

### Threat: Cron job infinite loop
**Attack Vector:**
- Buggy Custom Logic creates events triggering itself

**Mitigations:**
- [ ] Cron timeout (30s default)
- [ ] Circuit breaker (disable job after 10 consecutive failures)
- [ ] Event recursion detection (track event.causedBy chain)

---

## Elevation of Privilege

### Threat: End User bypasses role-based permissions
**Attack Vector:**
- CEL injection (craft WHERE clause bypassing rules)
- Direct DB access (if credentials leaked)

**Mitigations:**
- [ ] CEL expressions sandboxed (no file I/O, no network)
- [ ] WHERE clause sanitization (parameterized queries only)
- [ ] BYO DB credentials scoped (Bridge-only, not exposed)

### Threat: Operator exceeds RBAC permissions
**Attack Vector:**
- Teammate role escalation via Hub API bug
- Invite token reuse after expiry

**Mitigations:**
- [ ] Role checks at Hub API layer (every request)
- [ ] Invite tokens single-use, short TTL (24h)
- [ ] Audit log all role changes

---

## Security Checklist (Pre-Production)

### Operator Plane (Hub + CLI)
- [ ] Hub TLS certificate valid (no self-signed in prod)
- [ ] Operator password policy (min 12 chars, complexity)
- [ ] MFA enabled for all operators
- [ ] Service token rotated (not using default)
- [ ] Audit log backup configured
- [ ] Hub DB encrypted at rest
- [ ] `/internal/*` network isolated (not public)

### Data Plane (Bridge)
- [ ] BYO DB credentials use least privilege (no SUPERUSER)
- [ ] API key rotation policy documented
- [ ] Rate limiting enabled
- [ ] CORS configured (not wildcard `*`)
- [ ] OTEL exporter filters sensitive data
- [ ] Signing keys rotated quarterly
- [ ] Bridge instances behind L7 LB (DDoS protection)

### Application Layer
- [ ] Schema review process enforced (GitHub branch protection)
- [ ] Destructive changes require manual approval
- [ ] Custom Logic reviewed for SQL injection
- [ ] Storage bucket public access blocked (presigned URLs only)
- [ ] Event handlers idempotent (at-least-once delivery)
```

**Effort:** 5-6 hours
**Impact:** High — Proactive security, compliance readiness

---

### 7. Performance Benchmarks & SLOs ⚠️ P2

**Problem:** No performance targets defined. Can't measure if system is "fast enough."

**Recommendation:**
Create `plan/spec/performance.md` with SLOs.

**Effort:** 3-4 hours
**Impact:** Medium — Guides optimization efforts

---

### 8. Backup & Disaster Recovery ⚠️ P2

**Problem:** Hub stores critical metadata (releases, audit logs, secrets) but no backup/DR plan.

**Recommendation:**
Create `plan/flows/disaster-recovery.md` covering:
- Hub DB backup schedule (hourly snapshots, 7-day retention)
- Point-in-time recovery for audit logs
- Secrets recovery (KMS/HSM integration)
- Multi-region Hub failover

**Effort:** 4-5 hours
**Impact:** Medium — Critical for production, but not immediate MVP blocker

---

### 9. Versioning & Compatibility Matrix ⚠️ P2

**Problem:** No versioning strategy for CLI ↔ Hub ↔ Bridge.

**Recommendation:**
Create `plan/spec/versioning.md` defining:
- Semantic versioning policy (when to bump major/minor/patch)
- Compatibility matrix (which versions can talk to each other)
- Deprecation timeline (how long old versions are supported)
- Breaking change communication

**Effort:** 2-3 hours
**Impact:** Medium — Important for long-term maintenance

---

### 10. Open Questions → Decision Log ⚠️ P2

**Problem:** `plan/notes/open-questions.md` grows but resolved items disappear.

**Recommendation:**
Create `plan/notes/decision-log.md`:

**Format:**
```markdown
# Decision Log

## 2026-02-10: Cron Timezone & Expression Spec (PR-001, PR-002)

**Context:** Cron schedule interpretation ambiguous across timezones/DST.

**Decision:**
- All cron schedules use **UTC timezone** (no DST)
- Standard 5-field cron expressions only (no seconds/years)

**Rationale:**
- Predictable scheduling across all deployment regions
- Aligns with Kubernetes CronJob behavior
- Avoids DST edge cases (2am doesn't exist on spring-forward day)

**Alternatives Considered:**
1. Per-job timezone config → Rejected (operational complexity)
2. 6-field with seconds → Rejected (sub-minute not needed, adds confusion)

**References:** `plan/spec/events.md` Section 2.2.1

---

## 2026-02-10: Event Payload Validation Strategy (PR-003)

**Context:** Handler requires field not in event payload. Where to fail?

**Decision:**
- Validate at **publish time** (400/SCHEMA_VALIDATION_FAILED)
- Fail at **handler execution time** → retry → DLQ

**Rationale:**
- Early validation prevents bad events entering system
- Handler failures support at-least-once delivery semantics
- DLQ provides audit trail for debugging

**Alternatives Considered:**
1. Schema validation only at handler → Rejected (pollutes DLQ with preventable errors)
2. Block handler registration if schema mismatch → Rejected (prevents schema evolution)

**References:** `plan/spec/events.md` Section 1.3.2
```

**Effort:** 1 hour (initial setup) + ongoing
**Impact:** Low immediate, High long-term (preserves institutional knowledge)

---

### 11. SDK Generation Strategy ⚠️ P2

**Problem:** `client-sdk.md` describes manual SDK structure. Won't scale to multiple languages.

**Recommendation:**
Create `plan/implement/codegen.md` covering:
- Schema IR → TypeScript types (automatic)
- Permissions → SDK type guards
- OpenAPI spec generation from Bridge routes
- SDK release automation (on schema changes)

**Effort:** 4-5 hours
**Impact:** Medium — Not MVP blocker, but critical for multi-language support

---

### 12. Observability Dashboard Templates ⚠️ P3

**Problem:** Metrics/traces defined but no visualization guidance.

**Recommendation:**
Create `plan/observability/dashboards/`:
- `grafana-bridge.json` — Bridge metrics
- `grafana-hub.json` — Hub metrics
- `jaeger-queries.md` — Common trace queries
- `alerting-rules.yml` — Prometheus alerts

**Effort:** 3-4 hours
**Impact:** Low — Nice-to-have for operators

---

## Implementation Priority

### Phase 1: Critical (Start Immediately)
1. **ARCHITECTURE.md** (2-3h) — Unblocks navigation
2. **Schema Evolution** (4-6h) — Blocks production readiness
3. **Limits** (4-5h) — Prevents capacity incidents

### Phase 2: High Priority (Within 2 Weeks)
4. **Error Recovery Playbooks** (6-8h)
5. **Testing Strategy** (6-8h)
6. **Security Threat Model** (5-6h)

### Phase 3: Medium Priority (Before GA)
7. **Performance SLOs** (3-4h)
8. **Disaster Recovery** (4-5h)
9. **Versioning** (2-3h)
10. **Decision Log** (1h + ongoing)
11. **SDK Codegen** (4-5h)

### Phase 4: Nice-to-Have (Post-GA)
12. **Dashboard Templates** (3-4h)

---

## Total Effort Estimate

- **P0 (Critical):** 10-14 hours
- **P1 (High):** 17-22 hours
- **P2 (Medium):** 14-18 hours
- **P3 (Low):** 3-4 hours

**Total:** ~44-58 hours (approximately 1-2 weeks for one person)

---

## Success Metrics

After implementing these improvements:

1. **Onboarding Time:** New engineer can understand system in < 4 hours (vs current ~8-12h)
2. **MTTR:** Average incident recovery time < 30 minutes (with playbooks)
3. **Production Incidents:** Zero capacity-related incidents (with limits doc)
4. **Test Coverage:** 80%+ across all components
5. **Security Posture:** Pass external security audit (with threat model)

---

## Next Steps

**Recommended Order:**
1. Create `ARCHITECTURE.md` (quick win, high impact)
2. Start `decision-log.md` and document recent decisions (PR-001 to PR-005)
3. Add "Limits" subsections to existing specs (distribute work)
4. Tackle `schema-evolution.md` (highest risk area)
5. Build out testing strategy (enables confident iteration)

**Question for Team:** Which area should we prioritize first based on current project phase?
