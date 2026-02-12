# Security Flows

## Flow 13 — End User: CEL Condition 기반 WHERE 주입

목표:
- `permissions.yaml`의 CEL `condition`이 실제 SQL WHERE 절로 올바르게 주입되는지 검증한다.
- 데이터 소유자(`resource.id == request.auth.sub`) 기반의 접근 제어를 확인한다.

---

### A. 환경 설정

1) `users` 테이블 정의 (`generate: client` 전략 사용)
2) `permissions.yaml`에 CEL 조건 설정:
   ```yaml
   tables:
     users:
       select:
         roles: [authenticated]
         condition: "resource.id == request.auth.sub"
   ```

---

### B. 사용자 시나리오

1) **사용자 가입 및 로그인**:
   - 사용자 A와 사용자 B가 각각 가입하고 토큰을 획득한다.
2) **데이터 준비**:
   - 사용자 A는 본인의 `sub`를 ID로 하여 레코드를 생성한다.
   - 사용자 B도 본인의 `sub`를 ID로 하여 레코드를 생성한다.
3) **조회 검증 (WHERE 주입)**:
   - 사용자 A가 전체 조회를 요청하면, 본인의 레코드 1개만 조회되어야 한다. (조건 주입 확인)
   - 사용자 A가 사용자 B의 ID를 명시하여 조회를 시도해도 결과가 비어있어야 한다. (강제 필터링 확인)
4) **수정 검증**:
   - 사용자 A가 사용자 B의 레코드 수정을 시도하면 영향받은 행이 0이어야 한다.

---

## Flow 14 — Explicit Column Permissions (API Key Role 기반)

목표:
- 컬럼명 prefix 규칙 없이, `permissions.yaml`의 `columns` 지정만으로 컬럼 접근이 제어되는지 검증한다.

전제:
- `permissions.yaml`에 role별 컬럼 접근 규칙이 정의되어 있다.
- `admin`은 전체 컬럼 조회 가능, `viewer`는 제한된 컬럼만 조회 가능.

---

### A. 환경 설정

1) `users` 테이블 스키마를 적용한다.
2) `permissions.yaml` 예시:
   - `select`: `admin -> ["*"]`, `viewer -> ["id", "normal", "s_sensitive"]`
   - `insert/update/delete`: `admin`만 허용
3) admin/viewer API key를 발급한다.

---

### B. 테스트 시나리오

1) **Admin insert/select 성공**:
   - admin key로 insert 후 select를 호출하면 성공해야 한다.
2) **Viewer select 제한 검증**:
   - viewer key로 동일 row를 select하면 정책상 허용된 컬럼만 반환되거나, 정책 미충족이면 `403`이어야 한다.
3) **Viewer write 차단**:
   - viewer key로 insert/update/delete 시도 시 `403`이어야 한다.

---

## Flow 16 — Column-Level Permissions

목적:
permissions.yaml의 columns 섹션을 통해 정책 레벨에서 컬럼 접근을 제한하는 기능을 검증한다.

전제조건:
- 프로젝트/환경/DB 연결 완료
- 스키마에 users 테이블 (id, name, email, avatar_url, c_ssn, bio 컬럼)
- permissions.yaml에 columns 제한 설정

---

### 시나리오

1. **columns.select 제한**: 기본 role의 select는 정책에 정의된 컬럼만 반환
2. **columns.update 제한**: `["name", "avatar_url"]` → email UPDATE 시 403, name UPDATE는 성공
3. **columns.insert 제한**: `["name", "email", "avatar_url", "bio"]` → c_ssn INSERT 시 403
4. admin role의 select는 전체 컬럼(또는 정책상 허용 컬럼)을 반환
5. 와일드카드 prefix 패턴(`!c_*`)은 사용하지 않는다

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: permissions 설정 + 호출 예시(헤더/바디) 1개 이상 제시
- 성공 기준: 기대 상태코드와 핵심 응답 필드 제시
- 실패 기준: 최소 1개 부정 케이스와 기대 에러코드 제시

---
---

# STRIDE Threat Model

This section provides a comprehensive threat analysis using the STRIDE methodology to identify and mitigate security risks across the Santokit platform.

---

## Spoofing

### Threat 1: Attacker Impersonates Operator

**Attack Vectors:**
- Stolen CLI credentials (`~/.santokit/credentials`)
- Compromised CI/CD pipeline with `stk` access
- Session token theft (XSS, malware)

**Impact:**
- Unauthorized schema changes (data loss, service disruption)
- Access to sensitive project data
- Privilege escalation (create admin accounts)

**Mitigations:**
- [ ] **Encrypt credentials at rest** — Use OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- [ ] **Short-lived tokens** — Operator session tokens: 1 hour TTL, require refresh
- [ ] **MFA for sensitive operations** — Require 2FA for `stk apply --env prod`, `stk release rollback`
- [ ] **Audit log all Hub operations** — Track actor (email, IP, session ID) for all mutations
- [ ] **IP allowlisting** — Restrict Hub access to known operator IPs/VPNs
- [ ] **Anomaly detection** — Alert on unusual activity (midnight schema changes, bulk deletes)

**Testing:**
```bash
# Test: Stolen credentials rejected after timeout
stk auth login --email operator@example.com
# Wait 1 hour + 1 minute
stk projects list
# Expected: 401 UNAUTHORIZED, require re-authentication
```

---

### Threat 2: Attacker Impersonates End User

**Attack Vectors:**
- Stolen access token (XSS, local storage leak)
- Replay attack (captured token used from different device)
- Token not properly invalidated on logout

**Impact:**
- Unauthorized data access (read other users' data)
- Data modification (update/delete on behalf of victim)
- Privilege escalation (if token roles not validated)

**Mitigations:**
- [ ] **HttpOnly cookies** — For SSR applications, store tokens in HttpOnly cookies (not localStorage)
- [ ] **Short-lived tokens** — Access tokens: 1 hour TTL, refresh tokens: 7 days
- [ ] **Token binding** — Optionally bind token to IP address or device fingerprint (configurable)
- [ ] **Rotate signing keys** — Quarterly key rotation, invalidates old tokens
- [ ] **Logout invalidation** — Maintain token revocation list (Redis) for immediate invalidation
- [ ] **Audience claim validation** — JWT `aud` claim must match project ID

**Testing:**
```bash
# Test: Replay attack from different IP blocked (if binding enabled)
TOKEN=$(curl -X POST /auth/login -d '{"email":"user@example.com","password":"***"}' | jq -r '.access_token')
# From IP A
curl -H "Authorization: Bearer $TOKEN" /db/users/select
# Expected: 200 OK

# From IP B (different network)
curl -H "Authorization: Bearer $TOKEN" /db/users/select
# Expected: 401 UNAUTHORIZED (if IP binding enabled)
```

---

### Threat 3: Attacker Impersonates Bridge

**Attack Vectors:**
- Stolen service token (`STK_BRIDGE_TOKEN`)
- Network-level MITM (intercept Hub ↔ Bridge communication)
- Rogue Bridge instance registered to Hub

**Impact:**
- Fetch sensitive release payloads (schema, permissions)
- Access signing keys (JWT verification keys)
- Bypass rate limits (impersonate legitimate Bridge)

**Mitigations:**
- [ ] **Service token rotation** — Rotate `STK_BRIDGE_TOKEN` every 90 days
- [ ] **mTLS for Bridge ↔ Hub** — Mutual TLS authentication (future enhancement)
- [ ] **Network isolation** — `/internal/*` endpoints only accessible from private VPC
- [ ] **Bridge instance registration** — Hub tracks Bridge instances by instance ID + public key
- [ ] **Rate limit internal APIs** — Even `/internal/*` has rate limits per instance

**Testing:**
```bash
# Test: Invalid service token rejected
curl -H "Authorization: Bearer invalid_token" \
  https://hub.example.com/internal/releases/current
# Expected: 401 UNAUTHORIZED
```

---

## Tampering

### Threat 4: Release Payload Modified in Transit

**Attack Vectors:**
- MITM on Hub → Bridge communication (if TLS broken)
- Compromised Bridge instance modifies cached release
- DNS hijacking (Bridge connects to fake Hub)

**Impact:**
- Schema corruption (wrong column types, missing tables)
- Permission bypass (attacker-controlled CEL expressions)
- Data loss (incorrect SQL generation)

**Mitigations:**
- [x] **TLS 1.3 required** — All Hub API calls use TLS 1.3, enforce via `min_tls_version` config
- [ ] **Release payload integrity** — HMAC signature on release payload, Bridge verifies before caching
- [ ] **Bridge verifies Hub certificate** — Pin Hub's TLS certificate or use cert transparency logs
- [ ] **Audit log release fetches** — Hub logs which Bridge instances fetch which releases

**Implementation:**
```rust
// Hub: Sign release payload
let signature = hmac_sha256(release_json, hub_secret_key);
response.headers.insert("X-Release-Signature", signature);

// Bridge: Verify signature before caching
let signature = response.headers.get("X-Release-Signature")?;
let valid = verify_hmac(release_json, signature, hub_secret_key);
if !valid {
    return Err("Release payload signature invalid");
}
```

---

### Threat 5: Schema Tampered in Git Before `stk apply`

**Attack Vectors:**
- Malicious PR merged without review (compromised reviewer account)
- Compromised developer account pushes directly to main
- CI/CD pipeline manipulated to bypass checks

**Impact:**
- Backdoor tables created (exfiltration)
- Permissions loosened (unauthorized access)
- Data loss (drop table in migration)

**Mitigations:**
- [ ] **Git branch protection** — Require 2+ reviews for `main` branch PRs
- [ ] **Schema drift detection** — Hub compares applied schema with Git snapshot, alerts if mismatch
- [ ] **Destructive change warnings** — `stk plan` shows big red warning for `DROP TABLE`, `DROP COLUMN`
- [ ] **Require `--force` for destructive ops** — Operator must explicitly confirm with `stk apply --force`
- [ ] **Immutable audit log** — All schema changes logged with Git commit SHA, PR link

**Testing:**
```bash
# Test: Destructive change requires --force
echo "DROP TABLE users;" > migrations/drop_users.sql
stk apply --env prod
# Expected: Error: Destructive change detected. Use --force to confirm.

stk apply --env prod --force
# Expected: Success (with audit log entry)
```

---

## Repudiation

### Threat 6: Operator Denies Making Destructive Change

**Attack Vectors:**
- Shared credentials (team account, no individual attribution)
- Logs tampered or deleted after incident
- Operator claims "system glitch" or "hacked"

**Impact:**
- Loss of accountability (can't identify who caused incident)
- Compliance violation (audit trail required for SOC 2, GDPR)
- Trust erosion (team members don't trust system)

**Mitigations:**
- [x] **Audit log immutability** — Append-only table, no DELETE or UPDATE allowed (enforced via DB triggers)
- [ ] **Audit log backup to S3** — Daily export to immutable S3 bucket (Object Lock enabled)
- [x] **Individual operator accounts** — No shared credentials, each operator has unique email/MFA
- [x] **Include `requestId` in all audit entries** — Correlation with logs and traces
- [ ] **Signed audit entries** — Each entry signed with operator's key (future: non-repudiation proof)

**Implementation:**
```sql
-- Audit log table with append-only constraint
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_email TEXT NOT NULL,
  actor_ip INET NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  request_id UUID NOT NULL,
  trace_id TEXT
);

-- Trigger: Prevent UPDATE and DELETE
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_modification();
```

---

## Information Disclosure

### Threat 7: Secrets Leaked in Logs/Traces

**Attack Vectors:**
- DB connection string logged on error (`postgresql://user:password@...`)
- API key in error message (client sends invalid key, logged verbatim)
- `/internal/keys` response body in distributed trace

**Impact:**
- Database compromise (attacker uses leaked credentials)
- API key abuse (rate limit exhaustion, data exfiltration)
- JWT signing key leak (attacker forges tokens)

**Mitigations:**
- [x] **Sensitive info filtering** — See `observability.md` Section 4.2 (redact passwords, keys, tokens)
- [x] **`/internal/keys` excluded from logs/traces** — See `bridge-hub-protocol.md` Section 1.1.1
- [ ] **Redact connection strings in error messages** — Show `postgresql://***@host/db` instead of full URL
- [ ] **Secrets never in Git** — All secrets managed by Hub, not checked into source control
- [ ] **Logs encrypted at rest** — Log aggregation system encrypts stored logs

**Implementation:**
```rust
// Log filtering example
fn log_request(req: &Request) {
    let path = req.uri().path();
    if path.starts_with("/internal/keys") {
        // Skip logging
        return;
    }

    let headers = req.headers().clone();
    headers.remove("Authorization");  // Redact API key

    info!("Request: {} {}", req.method(), path);
}
```

**Testing:**
```bash
# Test: API key not in logs
curl -H "Authorization: Bearer stk_live_secret123" /db/users/select
grep "stk_live_secret123" /var/log/bridge.log
# Expected: No matches
```

---

### Threat 8: Schema Info Exposed to Unauthorized User

**Attack Vectors:**
- End User queries table/column list via MCP server (without operator auth)
- Error messages reveal table names (`Table 'internal_admin_logs' not found`)
- Permissions leakage (403 error reveals column exists)

**Impact:**
- Schema enumeration (attacker learns DB structure)
- Targeted attacks (knows which tables to exploit)
- Information leakage (existence of `vip_customers` table hints at feature)

**Mitigations:**
- [x] **MCP server requires operator authentication** — See `mcp.md` (operator must be authenticated to introspect schema)
- [ ] **Generic error messages to End Users** — Return `RESOURCE_NOT_FOUND` instead of `Table 'foo' not found`
- [ ] **Schema introspection disabled by default** — Operators opt-in via `schema_introspection: true` in config
- [ ] **Column existence not revealed** — 403 error same whether column exists or not

**Implementation:**
```rust
// Generic error for end users
if !user.is_operator() {
    return Err(ErrorCode::NotFound);  // Don't reveal table name
}

// Detailed error for operators
return Err(format!("Table '{}' not found in schema", table_name));
```

---

## Denial of Service

### Threat 9: Resource Exhaustion via API Abuse

**Attack Vectors:**
- Unbounded SELECT (fetch all rows: `SELECT * FROM users`)
- Expensive FK expansion (N+1 query bomb: expand 10 levels deep)
- Pub/Sub event flood (10,000 events/sec to single topic)
- Slow query attack (complex JOIN without indexes)

**Impact:**
- Bridge instances crash (OOM, CPU saturation)
- Database overload (connection pool exhausted)
- Legitimate users unable to access system
- Cost spike (cloud billing)

**Mitigations:**
- [x] **Rate limits per API key / End User** — See `limits.md` (1,000 req/min per API key, 100 req/min per user)
- [x] **Query timeout** — 30s default, kills long-running queries
- [x] **Result set limit** — 10,000 rows max per SELECT
- [x] **FK expansion depth limit** — 3 levels max
- [ ] **Cost-based query rejection** — PostgreSQL query planner estimates cost, reject if > threshold
- [ ] **DDoS protection at edge** — CloudFlare, AWS WAF to absorb volumetric attacks

**Implementation:**
```rust
// Check FK expansion depth
if expand_depth > MAX_FK_DEPTH {
    return Err(ErrorCode::BadRequest {
        message: format!("FK expansion depth limited to {}", MAX_FK_DEPTH),
    });
}

// Check result set size
if row_count > MAX_RESULT_ROWS {
    return Err(ErrorCode::BadRequest {
        message: format!("Result set exceeds {} rows", MAX_RESULT_ROWS),
    });
}
```

**Testing:**
```bash
# Test: Rate limit enforced
for i in {1..1100}; do
  curl -H "Authorization: Bearer $API_KEY" /db/users/select &
done
wait

# Expected: First 1000 succeed (200), next 100 fail (429 TOO_MANY_REQUESTS)
```

---

### Threat 10: Cron Job Infinite Loop

**Attack Vectors:**
- Buggy Custom Logic creates events that trigger itself (recursion)
- Cron job fails, retries immediately, fails again (tight loop)
- Event handler infinite retry (no circuit breaker)

**Impact:**
- DLQ fills up (storage exhaustion)
- Database overload (event processing queries)
- Cost spike (compute resources)

**Mitigations:**
- [ ] **Cron timeout** — 30s default, kills runaway jobs
- [ ] **Circuit breaker** — Disable job after 10 consecutive failures (manual re-enable)
- [ ] **Event recursion detection** — Track `event.causedBy` chain, reject if depth > 5
- [ ] **Exponential backoff for retries** — 1s, 2s, 4s, ..., max 10 retries
- [ ] **Alert on DLQ growth** — Operator notified if DLQ > 1,000 events

**Implementation:**
```rust
// Event recursion check
fn check_recursion(event: &Event) -> Result<()> {
    let mut depth = 0;
    let mut current = event;

    while let Some(caused_by) = &current.caused_by {
        depth += 1;
        if depth > MAX_EVENT_RECURSION_DEPTH {
            return Err("Event recursion depth exceeded");
        }
        current = get_event(caused_by)?;
    }

    Ok(())
}
```

---

## Elevation of Privilege

### Threat 11: End User Bypasses Role-Based Permissions

**Attack Vectors:**
- CEL injection (craft WHERE clause to bypass rules: `' OR '1'='1`)
- Direct DB access (if BYO DB credentials leaked)
- Race condition (check vs. use: permissions checked, then changed before query)

**Impact:**
- Unauthorized data access (read admin-only columns)
- Data modification (update other users' rows)
- Privilege escalation (promote self to admin role)

**Mitigations:**
- [ ] **CEL expressions sandboxed** — No file I/O, no network access, no subprocess execution
- [x] **WHERE clause sanitization** — Parameterized queries only (SeaQuery prevents SQL injection)
- [x] **BYO DB credentials scoped** — Bridge-only, not exposed to end users
- [ ] **Permission checks atomic** — Permission evaluation and query execution in single transaction
- [ ] **Audit log permission denials** — Track failed access attempts (detect brute-force)

**Testing:**
```bash
# Test: SQL injection via WHERE clause blocked
curl -X POST /db/users/select \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"where": {"name": {"$eq": "Alice"; DROP TABLE users;--"}}}'

# Expected: 400 BAD_REQUEST (SQL injection detected)
# Or: Query executes safely (parameterized, no injection)
```

---

### Threat 12: Operator Exceeds RBAC Permissions

**Attack Vectors:**
- Teammate role escalation via Hub API bug (viewer promotes self to admin)
- Invite token reuse after expiry (replay old invite link)
- Org owner account takeover (phishing, credential stuffing)

**Impact:**
- Unauthorized project access (viewer deletes production project)
- Schema sabotage (malicious schema changes)
- Audit log tampering (if operator gains DB access)

**Mitigations:**
- [ ] **Role checks at Hub API layer** — Every request validates actor role (not just at login)
- [x] **Invite tokens single-use, short TTL** — 24h expiry, consumed on first use
- [x] **Audit log all role changes** — Tracks who promoted whom, when
- [ ] **Require re-authentication for sensitive ops** — Ask for password again before `DELETE PROJECT`
- [ ] **Principle of least privilege** — Most operators should be `editor`, not `admin`

**Testing:**
```bash
# Test: Viewer cannot delete project
stk auth login --email viewer@example.com
stk project delete --project test-project

# Expected: 403 FORBIDDEN (requires admin or owner role)
```

---

## Security Checklist (Pre-Production)

### Operator Plane (Hub + CLI)

- [ ] Hub TLS certificate valid (no self-signed in production)
- [ ] Operator password policy enforced (min 12 chars, complexity, no common passwords)
- [ ] MFA enabled for all operators (TOTP or WebAuthn)
- [ ] Service token rotated (not using default/example token)
- [ ] Audit log backup configured (S3, 90-day retention)
- [ ] Hub DB encrypted at rest (AWS RDS encryption, Azure SQL TDE)
- [ ] `/internal/*` network isolated (VPC, not public internet)
- [ ] Hub rate limiting enabled (per operator, per IP)

### Data Plane (Bridge)

- [ ] BYO DB credentials use least privilege (no `SUPERUSER`, no `CREATE DATABASE`)
- [ ] API key rotation policy documented (90-day recommended)
- [ ] Rate limiting enabled (per API key, per End User)
- [ ] CORS configured (not wildcard `*`, specific origins only)
- [ ] OTEL exporter filters sensitive data (see `observability.md`)
- [ ] Signing keys rotated quarterly (documented process)
- [ ] Bridge instances behind L7 load balancer (DDoS protection, WAF)
- [ ] Query timeout enforced (30s default)

### Application Layer

- [ ] Schema review process enforced (GitHub branch protection, 2+ reviewers)
- [ ] Destructive changes require manual approval (`stk apply --force`)
- [ ] Custom Logic reviewed for SQL injection (parameterized queries only)
- [ ] Storage bucket public access blocked (presigned URLs only, no `s3:GetObject *`)
- [ ] Event handlers idempotent (at-least-once delivery, handle duplicates)
- [ ] Client SDK validates inputs (no user-controlled SQL fragments)

### Monitoring & Alerting

- [ ] Alert on failed authentication (> 100/min)
- [ ] Alert on permission denials (> 100/min)
- [ ] Alert on slow queries (p95 > 5s)
- [ ] Alert on DLQ growth (> 1,000 events)
- [ ] Alert on audit log gaps (missing entries)
- [ ] Dashboard for security metrics (auth failures, permission denials, etc.)

---

## Incident Response (Security)

**If security incident detected:**

1. **Contain** — Disable affected API keys, revoke tokens, isolate compromised instances
2. **Investigate** — Review audit logs, traces, DB queries for indicators of compromise
3. **Eradicate** — Patch vulnerability, rotate credentials, deploy fix
4. **Recover** — Restore from backup if needed, verify system integrity
5. **Post-mortem** — Document timeline, root cause, improvements

**Escalation:**
- **P0** — Data breach, credential leak, system-wide compromise
- **P1** — Attempted exploit, privilege escalation, DDoS attack
- **P2** — Suspicious activity, failed exploit attempt

**Contact:**
- Security team: security@santokit.example.com
- On-call: PagerDuty escalation policy

---

## Related Documents

- **`plan/spec/auth.md`** — Authentication and authorization model
- **`plan/spec/audit-log.md`** — Audit trail implementation
- **`plan/spec/operator-rbac.md`** — Operator permission model
- **`plan/spec/errors.md`** — Error disclosure policies
- **`plan/spec/observability.md`** — Logging and sensitive data filtering
- **`plan/spec/bridge-hub-protocol.md`** — Internal API security
- **`plan/flows/incident-response.md`** — Operational incident response

---

## Summary

**Security Principles:**
1. **Defense in depth** — Multiple layers of protection
2. **Least privilege** — Minimal permissions by default
3. **Fail secure** — Deny by default, explicit allow
4. **Audit everything** — Comprehensive logging and tracing
5. **Assume breach** — Design for compromise, not if but when

**Golden Rule:** Security is not a feature, it's a continuous practice. Review this threat model quarterly and after each major feature release.
