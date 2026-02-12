# Schema Evolution Strategy

This document defines how schema changes are managed in production environments to ensure zero-downtime deployments and backward compatibility.

---

## 1. Migration Patterns

### 1.1 Additive Changes (Safe)

These changes can be applied without downtime or coordination:

#### Adding New Tables

```yaml
# tables/new_feature.yaml
name: analytics_events
columns:
  - name: id
    type: uuid
    primaryKey: true
  - name: event_type
    type: text
  - name: created_at
    type: timestamptz
    default: now()
```

**Impact:** None to existing functionality
**Bridge Compatibility:** All versions
**Rollback:** Drop table if needed

#### Adding Nullable Columns

```yaml
# tables/users.yaml (before)
columns:
  - name: id
    type: uuid
  - name: name
    type: text

# tables/users.yaml (after)
columns:
  - name: id
    type: uuid
  - name: name
    type: text
  - name: phone_number  # New nullable column
    type: text
    nullable: true
```

**Impact:** Old Bridge versions ignore new column, new versions can read/write it
**Bridge Compatibility:** All versions
**Rollback:** Drop column (data loss) or make deprecated

#### Adding Columns with Defaults

```yaml
columns:
  - name: status
    type: text
    default: "'active'"  # SQL default ensures old writes still work
```

**Impact:** Old Bridge writes omit column → DB applies default
**Bridge Compatibility:** All versions
**Rollback:** Drop column or change default

#### Adding Indexes (PostgreSQL CONCURRENTLY)

```sql
-- Generated DDL includes CONCURRENTLY for production
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

**Impact:** Index builds in background, no table locks
**Bridge Compatibility:** All versions
**Rollback:** Drop index

---

### 1.2 Expand-Contract Pattern (Breaking Changes)

For changes that would break existing Bridge instances, use a three-phase approach:

#### Phase 1: Expand (Add New, Keep Old)

**Example: Renaming a column**

```yaml
# tables/users.yaml
columns:
  - name: id
    type: uuid
  - name: full_name      # Old column (keep for now)
    type: text
  - name: display_name   # New column
    type: text
    nullable: true       # Nullable during migration
```

**Deploy:**
1. Apply schema change: `stk apply --env prod`
2. Bridge continues using `full_name`
3. Deploy new Bridge version that writes to both columns (dual-write)

#### Phase 2: Migrate (Dual-Write + Backfill)

**Bridge Code (dual-write logic):**
```rust
// Write to both old and new columns during migration period
let insert_data = json!({
    "full_name": name,      // Old column
    "display_name": name,   // New column
});
```

**Backfill existing data:**
```sql
-- Run as Custom Logic or manual migration
UPDATE users
SET display_name = full_name
WHERE display_name IS NULL;
```

**Duration:** Minimum 30 days (Bridge version compatibility window)

#### Phase 3: Contract (Remove Old)

After all Bridge instances upgraded:

```yaml
# tables/users.yaml (final)
columns:
  - name: id
    type: uuid
  - name: display_name   # Only new column remains
    type: text
    nullable: false      # Now required
```

**Deploy:**
1. Verify no Bridge instances use `full_name`
2. Apply schema change: `stk apply --env prod`
3. Old column dropped

**Rollback Plan:** Keep old column with deprecation warning for 90 days before final removal

---

### 1.3 Column Type Changes

Type changes are risky and require expand-contract:

#### Safe Type Widening

```yaml
# Before: type: int
# After:  type: bigint
```

**Process:**
1. PostgreSQL: `ALTER TABLE users ALTER COLUMN user_id TYPE BIGINT;` (safe, no data loss)
2. Deploy Bridge with updated schema
3. No dual-write needed (data compatible)

#### Risky Type Changes (e.g., text → json)

```yaml
# Phase 1: Add new column
columns:
  - name: metadata_text  # Old
    type: text
  - name: metadata_json  # New
    type: jsonb
    nullable: true

# Phase 2: Dual-write + backfill
# Custom Logic to parse text → JSON

# Phase 3: Drop old column
columns:
  - name: metadata_json
    type: jsonb
```

**Duration:** 60 days (higher risk, longer compatibility window)

---

## 2. Zero-Downtime Strategy

### 2.1 Schema Lock Protocol

Schema changes in production require coordination with running Bridge instances.

#### Operator Workflow

```bash
# 1. Preview changes (dry-run)
stk plan --env prod

# 2. Check Bridge versions before applying
stk apply --env prod --check-bridge-versions

# Output:
Checking active Bridge versions...
Bridge v2.1.3 (last seen: 2m ago) ✅ Compatible
Bridge v2.0.8 (last seen: 5m ago) ⚠️  Upgrade required for column removal

Proceed with schema apply? [y/N]
```

**Warning Scenarios:**
- ⚠️  **Column removal**: Old Bridge may still reference column
- ⚠️  **Required column addition**: Old Bridge writes will fail without default
- ⚠️  **Type change**: Old Bridge may send incompatible data
- ✅ **Additive changes**: Always safe

#### Hub Enforcement

Hub tracks active Bridge versions via:
- `/internal/releases/current` polling (last_seen timestamp)
- Minimum version requirements per schema change type

**Blocking Logic:**
```rust
// Pseudo-code in Hub
if schema_change.is_breaking() {
    let active_bridges = get_active_bridges(project, env);
    let min_version = schema_change.required_bridge_version();

    for bridge in active_bridges {
        if bridge.version < min_version {
            return Err(VersionMismatch {
                bridge: bridge.version,
                required: min_version,
            });
        }
    }
}
```

**Override:** `stk apply --force` (for emergencies, requires admin role)

---

### 2.2 Release Coordination

#### Standard Deployment Sequence

**For Additive Changes:**
1. `stk apply --env prod` (schema change)
2. Deploy new Bridge version (can read new columns)
3. No coordination needed

**For Breaking Changes (Expand-Contract):**
1. **Phase 1**: `stk apply --env prod` (add new column, keep old)
2. Deploy Bridge v2.1 (dual-write to both columns)
3. Wait for all Bridge instances to upgrade (monitor via Hub)
4. **Backfill**: Run data migration
5. **Phase 2**: `stk apply --env prod` (drop old column)
6. Deploy Bridge v2.2 (only uses new column)

#### Rollback Plan

**If Bridge v2.1 has bugs:**
- Rollback to Bridge v2.0 (still works, uses old column)
- Old column still present (Phase 1 not contracted yet)

**If data migration fails:**
- Keep old column, investigate issues
- Bridge continues dual-writing

**If Phase 2 applied prematurely:**
- Emergency rollback: `stk release rollback --to <phase-1-release-id>`
- Manually re-add column via DDL (data may be lost)

---

### 2.3 Blue-Green Deployment (Advanced)

For high-risk changes, use blue-green with separate databases:

```bash
# 1. Clone production DB to "green" environment
pg_dump prod_db | psql green_db

# 2. Apply schema change to green
stk apply --env green

# 3. Deploy Bridge to green environment
stk deploy bridge --env green

# 4. Test in green (shadow traffic, smoke tests)
stk test --env green

# 5. Switch traffic to green (DNS/load balancer)
# 6. Monitor for issues
# 7. Decommission blue after 24 hours
```

**Use Cases:**
- Major version upgrades (PostgreSQL 14 → 15)
- Large-scale schema refactoring
- Migrating between database providers

---

## 3. Compatibility Matrix

### Schema Change vs. Bridge Version Compatibility

| Schema Change | Bridge Compatibility | Downtime Required | Risk Level |
|---------------|---------------------|-------------------|------------|
| **Additive** |
| Add table | All versions | No | Low |
| Add nullable column | All versions | No | Low |
| Add column with default | All versions | No | Low |
| Add index (CONCURRENTLY) | All versions | No | Low |
| **Expand-Contract** |
| Add required column (no default) | v2.0+ (with migration window) | No | Medium |
| Rename column | v2.1+ (with dual-write) | No | Medium |
| Change column type | v2.2+ (with dual-write) | No | High |
| **Destructive** |
| Remove column | v2.1+ (after Phase 2) | No (if unused) | High |
| Drop table | v2.2+ | No (if unused) | High |
| Drop index | All versions | No | Low |

### Minimum Compatibility Window

| Change Type | Minimum Window | Recommended Window |
|-------------|---------------|-------------------|
| Additive | Immediate | — |
| Rename | 30 days | 60 days |
| Type change | 30 days | 90 days |
| Column removal | 30 days | 90 days |
| Table removal | 60 days | 120 days |

---

## 4. Deprecation Lifecycle

### Phase 1: Deprecation Warning (30-90 days)

**Mark column as deprecated:**
```yaml
# tables/users.yaml
columns:
  - name: legacy_field
    type: text
    deprecated: true
    deprecation_reason: "Use 'new_field' instead"
    sunset_date: "2026-06-01"
```

**Bridge behavior:**
- Still functional, but logs warning:
  ```
  WARN: Column 'legacy_field' is deprecated (sunset: 2026-06-01). Migrate to 'new_field'.
  ```
- CRUD operations continue to work
- Client SDKs show deprecation notice

**Hub admin UI:**
- Shows deprecation banner for operators
- CLI command: `stk schema deprecated --env prod` lists deprecated columns

### Phase 2: Disable in New Releases (30 days)

**Block new usage:**
```yaml
# tables/users.yaml
columns:
  - name: legacy_field
    type: text
    deprecated: true
    disabled: true  # New writes rejected
```

**Bridge behavior:**
- Read operations: Still works (backward compatibility)
- Write operations: Returns error `COLUMN_DISABLED`
  ```json
  {
    "error": "COLUMN_DISABLED",
    "message": "Column 'legacy_field' is disabled. Use 'new_field' instead.",
    "sunset_date": "2026-06-01"
  }
  ```

### Phase 3: Remove from Schema (After Sunset Date)

**Final removal:**
```yaml
# tables/users.yaml
columns:
  - name: new_field
    type: text
  # legacy_field removed entirely
```

**Deployment:**
1. Verify no active clients use `legacy_field` (audit logs)
2. Apply schema: `stk apply --env prod` (column dropped)
3. Bridge returns `COLUMN_NOT_FOUND` if accessed

### Minimum Deprecation Period

| Change Type | Minimum Period | Notification Required |
|-------------|---------------|---------------------|
| Column deprecation | 90 days | Yes (email, docs, SDK) |
| Table deprecation | 180 days | Yes |
| API endpoint deprecation | 120 days | Yes |
| Custom Logic signature change | 60 days | Yes |

---

## 5. Bridge Version Management

### 5.1 Version Discovery

Hub tracks active Bridge versions via:

**Bridge → Hub polling:**
```http
GET /internal/releases/current
Headers:
  X-Bridge-Version: 2.1.3
  X-Bridge-Instance-Id: bridge-prod-us-east-1a
```

Hub records:
```sql
-- Hub internal tracking table
CREATE TABLE bridge_heartbeats (
  instance_id TEXT PRIMARY KEY,
  project_id UUID,
  env_name TEXT,
  version TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);
```

**Stale detection:**
- If `last_seen > 5 minutes ago` → Mark as inactive
- If all instances inactive → Allow breaking changes (emergency override)

### 5.2 Version Constraints

Schema changes declare minimum Bridge version:

```yaml
# migrations/2026-02-10-add-user-roles.yaml (hypothetical)
description: "Add roles column to users table"
minimumBridgeVersion: "2.1.0"
changes:
  - addColumn:
      table: users
      column:
        name: roles
        type: text[]
```

Hub checks before applying:
```bash
stk apply --env prod

Error: Schema change requires Bridge v2.1.0+
Active versions:
  - v2.0.8 (instance: bridge-prod-1) ❌
  - v2.1.3 (instance: bridge-prod-2) ✅

Recommendation: Upgrade bridge-prod-1 before applying schema.
```

### 5.3 Forced Upgrades

For critical security patches:

```bash
# Hub operator marks version as EOL
stk bridge deprecate-version --version "2.0.x" --reason "Security CVE-2026-1234"

# Bridge instances on v2.0.x receive shutdown signal
# /healthz returns 503 with message: "Version deprecated, upgrade required"
```

---

## 6. Testing Schema Changes

### 6.1 Pre-Production Validation

**Staging Environment Checklist:**
- [ ] Apply schema to staging: `stk apply --env staging`
- [ ] Run integration tests against new schema
- [ ] Verify old Bridge version still works (backward compatibility)
- [ ] Load test with production-like traffic
- [ ] Measure query performance (EXPLAIN ANALYZE)
- [ ] Check index usage: `pg_stat_user_indexes`

### 6.2 Production Rollout Strategy

**Low-Risk Changes (Additive):**
1. Apply to prod
2. Monitor for 5 minutes
3. Done

**High-Risk Changes (Breaking):**
1. Apply Phase 1 to prod (expand)
2. Deploy canary Bridge instance (1 replica)
3. Monitor for 1 hour (logs, errors, latency)
4. Scale to 10% of traffic
5. Monitor for 24 hours
6. Scale to 100%
7. Wait 30 days (compatibility window)
8. Apply Phase 2 (contract)

### 6.3 Automated Testing

**Schema Compatibility Tests:**
```rust
#[test]
fn test_old_bridge_with_new_schema() {
    // Simulate old Bridge version
    let old_bridge = BridgeV2_0::new();

    // Apply new schema (adds column)
    apply_migration("add_phone_number_column");

    // Old Bridge should still work (ignores new column)
    let result = old_bridge.select("users", json!({"where": {"id": "123"}}));
    assert!(result.is_ok());
}
```

**Migration Rollback Tests:**
```rust
#[test]
fn test_migration_rollback() {
    let release_before = get_current_release();
    apply_migration("add_column");
    rollback_to_release(release_before);

    // Verify column removed
    assert!(!schema_has_column("users", "new_column"));
}
```

---

## 7. Monitoring & Alerting

### 7.1 Schema Drift Detection

**Hub periodically snapshots schema:**
```sql
-- Hub tracks expected schema per release
CREATE TABLE schema_snapshots (
  release_id UUID,
  table_name TEXT,
  column_name TEXT,
  data_type TEXT,
  is_nullable BOOLEAN,
  PRIMARY KEY (release_id, table_name, column_name)
);
```

**Drift detection job (every 15 minutes):**
1. Hub queries actual DB schema (via Bridge internal API)
2. Compares with release snapshot
3. Alerts if mismatch (manual ALTER TABLE detected)

**Alert:**
```
⚠️  Schema drift detected in prod:users table!
Expected: 5 columns (per release abc123)
Actual:   6 columns (extra column: debug_flag)

Possible causes:
- Manual ALTER TABLE (not via stk apply)
- Release rollback without schema rollback
- Database restore from backup

Action: Run `stk schema reconcile --env prod`
```

### 7.2 Migration Metrics

**Track schema change performance:**
```
stk_schema_apply_duration_seconds{env="prod",table="users"} 4.2
stk_schema_apply_total{env="prod",result="success"} 42
stk_schema_apply_total{env="prod",result="failure"} 1
```

**Alert on slow migrations:**
```yaml
# Prometheus alert
- alert: SlowSchemaMigration
  expr: stk_schema_apply_duration_seconds > 30
  for: 1m
  annotations:
    summary: "Schema migration taking > 30s (env: {{ $labels.env }})"
```

---

## 8. Edge Cases & FAQs

### Q: What if Bridge and Hub are out of sync?

**Scenario:** Operator runs `stk apply` but Bridge is down, misses release polling.

**Solution:**
- Bridge cache max_stale: 1 hour (continues serving from cache)
- When Bridge restarts, immediately polls Hub for latest release
- If release incompatible, Bridge refuses to start (fail-fast)
- Operator must rollback release: `stk release rollback --env prod`

### Q: Can I rename a table?

**Answer:** Yes, using expand-contract:
1. Create new table with new name
2. Dual-write to both tables (via Custom Logic or Bridge code)
3. Backfill data
4. Update permissions.yaml to reference new table
5. Drop old table after 90 days

**Alternative:** Use PostgreSQL views:
```sql
CREATE VIEW new_table_name AS SELECT * FROM old_table;
```

### Q: What if migration fails halfway?

**Answer:** PostgreSQL DDL is transactional (except for CONCURRENT index builds).

**Safe DDL (in transaction):**
```sql
BEGIN;
ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
COMMIT;  -- Both changes or neither
```

**Unsafe DDL (CONCURRENTLY):**
```sql
CREATE INDEX CONCURRENTLY idx_email ON users(email);
-- If fails, leaves invalid index: SELECT * FROM pg_indexes WHERE indisvalid = false;
-- Clean up: DROP INDEX CONCURRENTLY idx_email;
```

**Hub behavior:**
- Wraps DDL in transaction
- If any statement fails → entire migration rolled back
- Audit log records failure
- Operator retries after fixing issue

### Q: How to handle database connection pools during schema changes?

**Answer:** Connections cache schema metadata.

**Strategy:**
1. Apply schema change
2. Hub triggers Bridge to reload schema:
   - `/internal/reload-schema` endpoint (authenticated)
   - Bridge clears query plan cache
   - Bridge reconnects DB connections (drains pool)
3. Next request uses new schema

**Automatic in Bridge v2.0+:**
- Release polling detects schema change
- Auto-triggers schema reload (no manual intervention)

---

## 9. Tools & Commands

### CLI Commands

```bash
# Preview schema changes (dry-run)
stk plan --env prod

# Apply with version check
stk apply --env prod --check-bridge-versions

# Force apply (skip version check, admin only)
stk apply --env prod --force

# Rollback to previous release
stk release rollback --env prod --to <release-id>

# List deprecated columns
stk schema deprecated --env prod

# Check active Bridge versions
stk bridge versions --env prod

# Reconcile schema drift
stk schema reconcile --env prod

# Test schema compatibility (staging)
stk schema test --env staging --bridge-version 2.0.8
```

### Admin Queries

```sql
-- Check active Bridge versions (Hub DB)
SELECT instance_id, version, last_seen
FROM bridge_heartbeats
WHERE project_id = 'xxx' AND env_name = 'prod'
ORDER BY last_seen DESC;

-- Check schema snapshots
SELECT table_name, column_name, data_type
FROM schema_snapshots
WHERE release_id = 'latest_release_id';

-- Find invalid indexes (failed CONCURRENT builds)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef LIKE '%INVALID%';
```

---

## 10. Related Documents

- **`plan/spec/schema.md`** — Schema definition and DDL plan/apply
- **`plan/spec/bridge-hub-protocol.md`** — Release polling and sync
- **`plan/flows/operator.md`** — Operator deployment workflows
- **`plan/notes/decision-log.md`** — Schema-related decisions (if any)
- **`plan/spec/versioning.md`** — Component versioning policy

---

## Summary

**Key Principles:**
1. **Additive changes are safe** — No coordination needed
2. **Breaking changes use expand-contract** — Three-phase migration
3. **Minimum 30-day compatibility window** — For Bridge version coexistence
4. **Schema changes are audited** — Full traceability
5. **Fail-fast on incompatibility** — Better to fail than corrupt data

**Golden Rule:** If unsure, use expand-contract. It's slower but safer.
