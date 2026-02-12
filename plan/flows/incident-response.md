# Incident Response Playbooks

This document provides step-by-step troubleshooting and recovery procedures for common Santokit errors and incidents.

---

## Quick Reference

| Error Code | Severity | MTTR Target | Playbook Section |
|------------|----------|-------------|-----------------|
| UNAUTHORIZED (401) | P3 | < 5 min | [Section 1](#1-unauthorized-401) |
| FORBIDDEN (403) | P3 | < 10 min | [Section 2](#2-forbidden-403) |
| NOT_FOUND (404) | P4 | < 5 min | [Section 3](#3-not_found-404) |
| SCHEMA_VALIDATION_FAILED (400) | P3 | < 10 min | [Section 4](#4-schema_validation_failed-400) |
| INTERNAL_ERROR (500) | P1 | < 30 min | [Section 5](#5-internal_error-500) |
| SERVICE_UNAVAILABLE (503) | P1 | < 15 min | [Section 6](#6-service_unavailable-503) |
| TOO_MANY_REQUESTS (429) | P2 | < 10 min | [Section 7](#7-too_many_requests-429) |

**MTTR**: Mean Time To Recovery

---

## 1. UNAUTHORIZED (401)

### 1.1 Symptoms

- End Users receiving 401 responses when calling Bridge API
- Mobile apps showing "Session expired" errors
- Logs contain: `invalid token`, `expired token`, `signature verification failed`

### 1.2 Common Causes

1. **Access token expired** (TTL: 1 hour by default)
2. **API key revoked or invalid**
3. **Clock skew** between client and server (> 5 minutes)
4. **Signing key rotation in progress** (Bridge hasn't synced new keys)
5. **Malformed Authorization header** (e.g., missing "Bearer" prefix)

### 1.3 Diagnostic Commands

```bash
# 1. Verify token validity (if you have the token)
stk auth verify-token --token <token> --env <env>

# Expected output if valid:
# ✅ Token valid
# User ID: user_123
# Expires: 2026-02-10 15:30:00 UTC (in 45 minutes)

# Expected output if expired:
# ❌ Token expired
# Expired at: 2026-02-10 14:00:00 UTC (1 hour ago)

# 2. Check API key status (if using API key auth)
stk apikeys list --project <project> --env <env>

# 3. Check signing keys (for JWT verification)
stk keys list --project <project> --env <env>

# Expected output:
# Key ID: key_abc123 (primary, created: 2026-02-01)
# Key ID: key_def456 (secondary, created: 2026-01-15)

# 4. Check Bridge key sync status
stk bridge status --show-keys --env <env>

# Expected output:
# Bridge: bridge-prod-1
# Last key sync: 30 seconds ago ✅
# Cached keys: 2 (key_abc123, key_def456)
```

### 1.4 Resolution Steps

#### Scenario A: Token Expired

**For End Users:**
1. Client should automatically refresh token using `refresh_token` grant
2. Check if refresh token endpoint is accessible: `/auth/token/refresh`
3. If refresh fails, user must re-authenticate (login flow)

**Example Client Code (TypeScript):**
```typescript
async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('/auth/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    // Refresh failed, redirect to login
    window.location.href = '/login';
  }

  const data = await response.json();
  return data.access_token;
}
```

**For Operators:**
- No action needed (client-side issue)
- Monitor refresh endpoint error rate: `stk metrics bridge --metric auth_refresh_errors_total`

#### Scenario B: API Key Revoked

**Symptoms:** Specific API key consistently returns 401

**Steps:**
1. Verify key was revoked:
   ```bash
   stk apikeys get <key-id> --project <project> --env <env>
   # Output: Status: REVOKED
   ```

2. Issue new API key:
   ```bash
   stk apikeys create --project <project> --env <env> --name "Production API Key"
   # Output: API Key: stk_live_abc123xyz...
   ```

3. Update client configuration:
   - For backend services: Update environment variable `STK_API_KEY`
   - For mobile apps: Push config update or require app restart

4. Verify new key works:
   ```bash
   curl -H "Authorization: Bearer stk_live_abc123xyz..." \
     https://bridge.example.com/db/users/select
   ```

#### Scenario C: Signing Key Rotation Issue

**Symptoms:** 401 errors started after signing key rotation, Bridge logs show "signature verification failed"

**Steps:**
1. Check key rotation status:
   ```bash
   stk keys status --project <project> --env <env>
   # Output: Rotation in progress (new key: key_xyz789, old key: key_abc123)
   ```

2. Force Bridge to sync keys immediately:
   ```bash
   stk bridge force-sync --project <project> --env <env>
   # This triggers immediate polling of /internal/keys
   ```

3. Wait 30 seconds (max polling interval), then verify:
   ```bash
   stk bridge status --show-keys --env <env>
   # Verify "Cached keys" includes new key
   ```

4. If still failing, check Hub logs:
   ```bash
   stk logs hub --filter "key_rotation" --since 1h
   ```

5. **Emergency Rollback:** Revert to old signing key (breaks new tokens):
   ```bash
   stk keys rollback --project <project> --env <env> --to <old-key-id>
   ```

#### Scenario D: Clock Skew

**Symptoms:** Intermittent 401 errors, more frequent during certain times of day

**Steps:**
1. Check client clock:
   ```bash
   # On client machine
   timedatectl status
   # Or for macOS:
   sudo sntp -s time.apple.com
   ```

2. Check server time:
   ```bash
   stk hub time
   # Output: 2026-02-10 14:30:00 UTC
   ```

3. If skew > 5 minutes:
   - Client: Enable NTP sync
   - Server: Verify NTP is running (`timedatectl` on Linux)

4. Temporary workaround (increase JWT clock skew tolerance):
   ```yaml
   # config/bridge.yaml
   auth:
     jwt_clock_skew_seconds: 300  # Allow 5 min skew (default: 60)
   ```

### 1.5 Escalation Criteria

- ⚠️  **Token refresh fails after 3 attempts** → P2 incident
- ⚠️  **Multiple projects affected** → P1 incident
- 🚨 **Hub signing key service down** → P0 incident

### 1.6 Prevention

- [ ] Monitor token expiration rate: `stk metrics bridge --metric auth_token_expired_total`
- [ ] Alert if refresh endpoint error rate > 5%
- [ ] Rotate signing keys quarterly (documented process)
- [ ] Test key rotation in staging before production

---

## 2. FORBIDDEN (403)

### 2.1 Symptoms

- Users receiving 403 responses for operations they should be able to perform
- Logs contain: `permission denied`, `rule evaluation failed`
- End Users report "You don't have permission to access this resource"

### 2.2 Common Causes

1. **Permission rule misconfigured** (typo in `permissions.yaml`)
2. **CEL expression error** (syntax error or runtime exception)
3. **Role not assigned to user** (user in wrong role)
4. **Column-level permissions** (user trying to access hidden column)
5. **Operator RBAC issue** (operator lacks permission for Hub API)

### 2.3 Diagnostic Commands

```bash
# 1. Check effective permissions for a user
stk permissions check \
  --project <project> \
  --env <env> \
  --user-id <user-id> \
  --table users \
  --operation select

# Expected output:
# ✅ SELECT allowed
# Matched rule: authenticated_users
# CEL expression: auth.userId != null

# 2. Test CEL expression
stk permissions test-cel \
  --expr "auth.role == 'admin' && resource.status == 'active'" \
  --context '{"auth": {"role": "user"}, "resource": {"status": "active"}}'

# Expected output:
# ❌ Evaluation result: false
# Reason: auth.role is 'user', not 'admin'

# 3. View user roles
stk users get <user-id> --project <project> --env <env>

# Expected output:
# User ID: user_123
# Roles: authenticated, viewer

# 4. Check recent permission denials
stk logs bridge \
  --filter "permission_denied" \
  --since 1h \
  --env <env>

# 5. Review permissions.yaml
stk releases current --project <project> --env <env> --section permissions
```

### 2.4 Resolution Steps

#### Scenario A: Permission Rule Typo

**Symptoms:** All users (or specific role) denied access after recent `stk apply`

**Steps:**
1. Identify recent permission changes:
   ```bash
   stk audit log --action permissions.apply --since 24h
   ```

2. Compare current vs. previous permissions:
   ```bash
   stk releases compare <prev-release-id> <current-release-id> --section permissions
   ```

3. If typo found, fix `permissions.yaml`:
   ```yaml
   # Before (typo: "autheticated")
   - rule: autheticated_users
     role: authenticated

   # After (fixed)
   - rule: authenticated_users
     role: authenticated
   ```

4. Apply fix:
   ```bash
   stk apply --env <env>
   ```

5. **Quick Rollback** (if fix takes time):
   ```bash
   stk release rollback --env <env> --to <prev-release-id>
   ```

#### Scenario B: CEL Expression Error

**Symptoms:** Logs show `CEL evaluation failed: no such key: auth.userId`

**Steps:**
1. Identify failing CEL expression:
   ```bash
   stk logs bridge --filter "CEL evaluation failed" --limit 10
   ```

2. Extract expression and context from logs

3. Test locally:
   ```bash
   stk permissions test-cel --expr "auth.userId == resource.ownerId" \
     --context '{"auth": {}, "resource": {"ownerId": "123"}}'
   # Error: no such key: auth.userId
   ```

4. Fix expression (handle missing key):
   ```yaml
   # Before
   where: "auth.userId == resource.ownerId"

   # After (safe access)
   where: "has(auth.userId) && auth.userId == resource.ownerId"
   ```

5. Apply fix and verify:
   ```bash
   stk apply --env <env>
   stk permissions check --user-id <user> --table <table> --operation select
   ```

#### Scenario C: Column-Level Permission

**Symptoms:** User can read some columns but not others (e.g., `internal_notes` hidden)

**Steps:**
1. Check column permissions:
   ```yaml
   # permissions.yaml
   - role: regular_user
     tables:
       users:
         select:
           columns: ["id", "name", "email"]  # internal_notes not listed
   ```

2. Verify user's role:
   ```bash
   stk users get <user-id> --show-roles
   ```

3. If user should access column:
   - Add column to role's `columns` list
   - Or assign user to higher-privilege role

4. If working as intended:
   - Update client to not request hidden columns
   - Or return generic error to avoid leaking column existence

#### Scenario D: Operator RBAC

**Symptoms:** Operator can't run `stk apply` (Hub returns 403)

**Steps:**
1. Check operator's role:
   ```bash
   stk whoami
   # Output: Email: alice@example.com, Role: viewer
   ```

2. Required role for `stk apply`: **admin** or **editor**

3. Ask org owner to upgrade role:
   ```bash
   # As org owner
   stk team members update \
     --email alice@example.com \
     --role editor \
     --org <org>
   ```

4. Verify:
   ```bash
   stk whoami
   # Output: Role: editor ✅
   ```

### 2.5 Escalation Criteria

- ⚠️  **All users denied access** → P1 incident (rollback immediately)
- ⚠️  **Permission change affects production traffic** → P2 incident
- 🚨 **Security-critical column exposed** → P0 incident (disable Bridge, investigate)

### 2.6 Prevention

- [ ] Test permissions in staging before production
- [ ] Use `stk permissions simulate` to preview changes
- [ ] Peer review all `permissions.yaml` changes
- [ ] Monitor permission denial rate: alert if > 100/min

---

## 3. NOT_FOUND (404)

### 3.1 Symptoms

- API returns 404 for existing resources
- Logs show: `table not found`, `column not found`, `release not found`

### 3.2 Common Causes

1. **Table/column removed in recent schema change**
2. **Typo in API request** (e.g., `/db/user` instead of `/db/users`)
3. **Release not deployed to environment**
4. **Bridge cache stale** (hasn't synced new schema)

### 3.3 Diagnostic Commands

```bash
# 1. Check if table exists in schema
stk schema tables list --project <project> --env <env>

# 2. Check if column exists
stk schema table get users --project <project> --env <env>

# 3. Check current release
stk releases current --project <project> --env <env>

# 4. Check Bridge cache status
stk bridge status --show-cache-age --env <env>
```

### 3.4 Resolution Steps

#### Scenario A: Table Removed Accidentally

**Steps:**
1. Verify table missing:
   ```bash
   stk schema tables list | grep <table-name>
   # (no output)
   ```

2. Check audit log:
   ```bash
   stk audit log --action schema.apply --since 24h
   ```

3. Rollback to previous release:
   ```bash
   stk release rollback --env <env> --to <prev-release-id>
   ```

4. Add table back and re-apply:
   ```bash
   # Restore tables/<table-name>.yaml from git history
   git checkout <prev-commit> -- tables/<table-name>.yaml
   stk apply --env <env>
   ```

#### Scenario B: Client Typo

**Steps:**
1. Check API logs for requested path:
   ```bash
   stk logs bridge --filter "404" --limit 20
   # Look for patterns: /db/user vs /db/users
   ```

2. If typo confirmed, notify client developers

3. No server-side fix needed

#### Scenario C: Bridge Cache Stale

**Steps:**
1. Check cache age:
   ```bash
   stk bridge status --show-cache-age
   # Output: Cache age: 10 minutes ⚠️
   ```

2. Force refresh:
   ```bash
   stk bridge force-sync --env <env>
   ```

3. Verify table now found:
   ```bash
   curl https://bridge.example.com/db/<table>/select
   ```

### 3.5 Escalation Criteria

- ⚠️  **Critical table missing** → P1 incident
- ⚠️  **Multiple tables missing** → P0 incident (possible schema corruption)

---

## 4. SCHEMA_VALIDATION_FAILED (400)

### 4.1 Symptoms

- Event publish failures
- Logs show: `missing required field`, `type mismatch`
- Pub/Sub DLQ filling up

### 4.2 Common Causes

1. **Event payload missing required fields** (publisher bug)
2. **Schema evolution incompatibility** (new required field added)
3. **Type mismatch** (sending string instead of number)
4. **Publisher using outdated schema version**

### 4.3 Diagnostic Commands

```bash
# 1. Check topic schema
stk events topic get <topic-name> --env <env>

# 2. Check recent publish failures
stk events dlq list --topic <topic-name> --limit 20

# 3. Inspect failed event
stk events dlq inspect <event-id>

# 4. Compare schema versions
stk releases compare <old-release> <new-release> --section events
```

### 4.4 Resolution Steps

#### Scenario A: Missing Required Field

**Steps:**
1. Inspect failed event:
   ```bash
   stk events dlq inspect evt_123
   # Output:
   # Event ID: evt_123
   # Topic: user.created
   # Payload: {"name": "Alice"}
   # Error: Missing required field 'email'
   ```

2. Fix publisher code:
   ```typescript
   // Before
   publish('user.created', { name: user.name });

   // After
   publish('user.created', {
     name: user.name,
     email: user.email,  // Add missing field
   });
   ```

3. **Temporary fix** (make field optional):
   ```yaml
   # events/topics/user.created.yaml
   schema:
     name: string
     email: string  # Remove 'required: true' temporarily
   ```

4. After publisher fixed, replay DLQ:
   ```bash
   stk events dlq replay --topic user.created --since 1h
   ```

#### Scenario B: Schema Evolution Issue

**Steps:**
1. Identify when field became required:
   ```bash
   stk releases compare <old> <new> --section events
   ```

2. Use expand-contract pattern:
   - Phase 1: Add field as optional
   - Phase 2: Update all publishers
   - Phase 3: Mark field as required

3. Rollback if too many failures:
   ```bash
   stk release rollback --env <env>
   ```

#### Scenario C: DLQ Cleanup

**After fixing issue:**

1. Review DLQ:
   ```bash
   stk events dlq list --topic <topic>
   ```

2. Replay valid events:
   ```bash
   stk events dlq replay --topic <topic> --since <time>
   ```

3. Purge invalid events:
   ```bash
   stk events dlq purge --topic <topic> --before <time>
   ```

### 4.5 Escalation Criteria

- ⚠️  **DLQ growth > 100/min** → P2 incident
- 🚨 **Critical business event failing** → P1 incident

---

## 5. INTERNAL_ERROR (500)

### 5.1 Symptoms

- Bridge returning 500 errors
- Hub admin APIs failing
- Logs show SQL errors, panics, or stack traces

### 5.2 Common Causes

1. **Database connection pool exhausted**
2. **SQL query timeout** (> 30s)
3. **Permission evaluation error** (CEL parsing crash)
4. **Release payload corrupted**
5. **Dependency service down** (Hub, DB)

### 5.3 Diagnostic Commands

```bash
# 1. Check Bridge health
curl https://bridge.example.com/healthz
curl https://bridge.example.com/readyz

# 2. Check database connections
stk connections test --project <project> --env <env>

# 3. Check release status
stk releases current --project <project> --env <env>

# 4. Check recent errors (last 1 hour)
stk logs bridge --level error --since 1h --env <env>

# 5. Check metrics
stk metrics bridge --metric db_pool_active,db_pool_idle
```

### 5.4 Resolution Steps

#### Scenario A: DB Pool Exhausted

**Symptoms:** Logs show `connection pool timeout`, `all connections in use`

**Steps:**
1. Check pool usage:
   ```bash
   stk metrics bridge --metric db_pool_active
   # Output: db_pool_active: 98/100 (98% saturated)
   ```

2. **Immediate fix** (scale horizontally):
   ```bash
   # Add more Bridge instances
   kubectl scale deployment bridge --replicas=5
   ```

3. **Long-term fix** (increase pool size):
   ```yaml
   # config/bridge.yaml
   database:
     pool_max_size: 200  # Increase from 100
   ```

4. Check for connection leaks:
   ```bash
   stk logs bridge --filter "connection not returned" --since 1h
   ```

#### Scenario B: SQL Timeout

**Symptoms:** Logs show `query timeout exceeded`, `canceling statement due to user request`

**Steps:**
1. Identify slow queries:
   ```bash
   stk logs bridge --filter "duration > 5000" --since 1h
   # (shows queries taking > 5 seconds)
   ```

2. Analyze query plan:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'alice@example.com';
   # Check for sequential scans (Seq Scan)
   ```

3. Add index if missing:
   ```yaml
   # tables/users.yaml
   indexes:
     - name: idx_users_email
       columns: [email]
   ```

4. Apply schema change:
   ```bash
   stk apply --env <env>
   ```

#### Scenario C: Release Payload Corrupted

**Symptoms:** Bridge logs `invalid release payload`, `JSON parse error`

**Steps:**
1. Check release integrity:
   ```bash
   stk releases verify <release-id>
   ```

2. Rollback to previous release:
   ```bash
   stk release rollback --env <env> --to <prev-release-id>
   ```

3. Investigate corruption cause (Hub DB issue, network glitch)

### 5.5 Escalation Criteria

- ⚠️  **Error rate > 5% for 5 min** → P1 incident
- 🚨 **Hub unreachable** → P0 incident
- 🚨 **Data corruption suspected** → P0 incident + freeze changes

---

## 6. SERVICE_UNAVAILABLE (503)

### 6.1 Symptoms

- Bridge rejecting requests with 503
- `/readyz` endpoint failing
- Logs show "stale release cache", "Hub unreachable"

### 6.2 Common Causes

1. **Hub unreachable** (network issue, Hub down)
2. **Release cache expired** (> max_stale threshold)
3. **Signing keys sync failed**
4. **DB connection failed** (initial bootstrap)

### 6.3 Diagnostic Commands

```bash
# 1. Check Bridge readiness
curl https://bridge.example.com/readyz

# 2. Check Hub health
curl https://hub.example.com/healthz

# 3. Check release cache status
stk bridge status --show-cache-age --env <env>

# 4. Check last successful Hub sync
stk bridge logs --filter "hub_poll" --limit 10

# 5. Test network connectivity
stk bridge test-hub-connectivity --env <env>
```

### 6.4 Resolution Steps

#### Scenario A: Hub Unreachable

**Steps:**
1. Check Hub status:
   ```bash
   stk hub status
   # Output: Hub: DOWN ❌
   ```

2. Check network policies/firewall:
   ```bash
   # From Bridge instance
   curl https://hub.example.com/healthz
   ```

3. Check service token validity:
   ```bash
   # Verify STK_BRIDGE_TOKEN env var is set
   kubectl get secret bridge-token -o jsonpath='{.data.token}' | base64 -d
   ```

4. **Emergency:** Increase max_stale to keep serving:
   ```yaml
   # config/bridge.yaml
   release_cache:
     max_stale_seconds: 7200  # 2 hours (default: 1 hour)
   ```

#### Scenario B: Release Cache Expired

**Symptoms:** Logs show `release cache expired`, `max_stale exceeded`

**Steps:**
1. Check cache age:
   ```bash
   stk bridge status --show-cache-age
   # Output: Cache age: 90 minutes ⚠️ (max_stale: 60 min)
   ```

2. If Hub back online:
   ```bash
   stk bridge force-sync --env <env>
   # Cache refreshes in < 30s
   ```

3. If Hub still down:
   - Bridge serves 503 until Hub recovers
   - Monitor Hub recovery progress

#### Scenario C: Initial Bootstrap Failure

**Symptoms:** Bridge can't start, logs show `failed to fetch initial release`

**Steps:**
1. Check required env vars:
   ```bash
   echo $STK_HUB_URL
   echo $STK_BRIDGE_TOKEN
   echo $STK_PROJECT_ID
   echo $STK_ENV
   ```

2. Verify Hub has release for project/env:
   ```bash
   stk releases list --project <project> --env <env>
   ```

3. Check connection configuration exists:
   ```bash
   stk connections list --project <project> --env <env>
   ```

### 6.5 Escalation Criteria

- 🚨 **Hub down > 30 min** → P0 incident
- ⚠️  **Bridge can't bootstrap** → P1 incident
- ⚠️  **Multiple envs affected** → P1 incident

---

## 7. TOO_MANY_REQUESTS (429)

### 7.1 Symptoms

- Clients receiving 429 responses
- Logs show `rate limit exceeded`

### 7.2 Common Causes

1. **API key rate limit exceeded** (1,000 req/min default)
2. **End User rate limit exceeded** (100 req/min default)
3. **Retry storm** (client retries too aggressively)
4. **DDoS attack**

### 7.3 Diagnostic Commands

```bash
# 1. Check rate limit metrics
stk metrics bridge --metric rate_limit_exceeded_total

# 2. Identify top consumers
stk logs bridge --filter "429" --since 1h | \
  grep -oP 'api_key=\K[^,]+' | sort | uniq -c | sort -rn

# 3. Check if single user or distributed
stk metrics bridge --metric requests_per_api_key
```

### 7.4 Resolution Steps

#### Scenario A: Legitimate High Traffic

**Steps:**
1. Increase rate limit for specific API key:
   ```bash
   stk apikeys update <key-id> --rate-limit 5000
   ```

2. Or increase global limit:
   ```yaml
   # config/bridge.yaml
   rate_limits:
     per_api_key: 5000  # Increase from 1000
   ```

#### Scenario B: Client Retry Storm

**Steps:**
1. Identify retry pattern in logs

2. Ask client to implement exponential backoff:
   ```typescript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.status === 429) {
           const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
           await sleep(delay);
         } else {
           throw error;
         }
       }
     }
   }
   ```

#### Scenario C: DDoS Attack

**Steps:**
1. Block malicious API key:
   ```bash
   stk apikeys revoke <key-id>
   ```

2. Enable IP-based rate limiting (if available)

3. Review firewall rules / WAF policies

### 7.5 Escalation Criteria

- ⚠️  **Legitimate traffic rate-limited** → P2 incident
- 🚨 **DDoS attack suspected** → P1 incident (engage security team)

---

## 8. General Incident Response Process

### 8.1 Incident Severity Levels

| Severity | Definition | Examples | Response Time |
|----------|-----------|----------|---------------|
| P0 | Critical outage, data loss risk | Hub down, DB corrupted | < 15 min |
| P1 | Major functionality impaired | High error rate, API unavailable | < 30 min |
| P2 | Minor functionality impaired | Single feature broken, degraded performance | < 2 hours |
| P3 | Cosmetic issue, workaround available | Non-critical API errors | < 24 hours |
| P4 | Question or request | Documentation unclear | < 1 week |

### 8.2 Incident Response Workflow

1. **Detect** (via monitoring alerts)
2. **Acknowledge** (operator claims incident)
3. **Triage** (assess severity, assign priority)
4. **Diagnose** (use playbooks, gather logs)
5. **Mitigate** (apply workaround or fix)
6. **Verify** (confirm resolution)
7. **Post-mortem** (document learnings)

### 8.3 Communication Templates

**P0/P1 Incident Announcement:**
```
🚨 INCIDENT: [Title]
Severity: P0
Status: Investigating
Impact: Users unable to [specific impact]
ETA: [time] or "unknown"
Updates: Every 15 minutes

Last update: [timestamp]
```

**Resolution Announcement:**
```
✅ RESOLVED: [Title]
Duration: [start] - [end] (X hours)
Root cause: [brief summary]
Post-mortem: [link to doc]
```

---

## 9. Tools & Resources

### CLI Commands Cheat Sheet

```bash
# Health Checks
stk bridge status --env <env>
stk hub status

# Logs
stk logs bridge --since 1h --filter "error"
stk logs hub --since 1h --filter "schema"

# Metrics
stk metrics bridge --metric <metric-name>

# Permissions
stk permissions check --user <user> --table <table> --operation select
stk permissions test-cel --expr "<expr>" --context '<json>'

# Releases
stk releases current --env <env>
stk release rollback --env <env> --to <release-id>

# Events
stk events dlq list --topic <topic>
stk events dlq replay --topic <topic> --since 1h
```

### Monitoring Dashboards

- **Bridge Performance**: https://grafana.example.com/d/bridge-perf
- **Hub Operations**: https://grafana.example.com/d/hub-ops
- **Capacity Planning**: https://grafana.example.com/d/capacity

### On-Call Resources

- **Runbook Wiki**: https://wiki.example.com/santokit/runbooks
- **Slack Channel**: #santokit-oncall
- **Escalation Policy**: See PagerDuty

---

## 10. Related Documents

- **`plan/spec/errors.md`** — Full error catalog
- **`plan/spec/observability.md`** — Metrics and logging
- **`plan/spec/limits.md`** — System limits and capacity
- **`plan/spec/schema-evolution.md`** — Schema change procedures
- **`plan/flows/disaster-recovery.md`** — Backup and restore procedures

---

## Summary

**Golden Rules:**
1. **Check health endpoints first** (`/healthz`, `/readyz`)
2. **Consult metrics before logs** (faster diagnosis)
3. **Use rollback when in doubt** (fail-safe)
4. **Document every incident** (learn and improve)
5. **Communicate proactively** (keep users informed)

**Remember:** These playbooks are living documents. Update them after each incident with new learnings.
