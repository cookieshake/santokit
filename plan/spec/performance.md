# Performance & Service Level Objectives (SLOs)

This document defines performance targets, benchmarking methodology, and monitoring strategies for the Santokit platform.

---

## 1. Service Level Objectives (SLOs)

### 1.1 Bridge (Data Plane) — End User API

| Operation | p50 | p95 | p99 | Target Availability |
|-----------|-----|-----|-----|-------------------|
| **CRUD (Simple)** |
| SELECT (no FK) | < 50ms | < 200ms | < 500ms | 99.9% |
| SELECT (with pagination) | < 60ms | < 220ms | < 550ms | 99.9% |
| INSERT | < 50ms | < 150ms | < 300ms | 99.9% |
| UPDATE | < 60ms | < 180ms | < 350ms | 99.9% |
| DELETE | < 40ms | < 120ms | < 250ms | 99.9% |
| **CRUD (FK Expansion)** |
| SELECT + FK (1 level) | < 100ms | < 300ms | < 700ms | 99.9% |
| SELECT + FK (2 levels) | < 150ms | < 400ms | < 900ms | 99.5% |
| SELECT + FK (3 levels) | < 200ms | < 500ms | < 1s | 99.5% |
| **Custom Logic** |
| Simple function | < 100ms | < 400ms | < 800ms | 99.5% |
| Complex transaction | < 500ms | < 1s | < 2s | 99.0% |
| **Events** |
| Publish event | < 50ms | < 150ms | < 300ms | 99.9% |
| Handler execution | < 200ms | < 1s | < 2s | 99.5% |
| **Storage** |
| Generate presigned URL | < 10ms | < 30ms | < 50ms | 99.9% |

### 1.2 Hub (Control Plane) — Operator API

| Operation | p50 | p95 | p99 | Target Availability |
|-----------|-----|-----|-----|-------------------|
| Schema apply (10 tables) | < 3s | < 10s | < 15s | 99.5% |
| Schema apply (100 tables) | < 10s | < 30s | < 45s | 99.0% |
| Release creation | < 1s | < 3s | < 5s | 99.5% |
| Audit log write | < 50ms | < 150ms | < 300ms | 99.9% |
| Project creation | < 500ms | < 1s | < 2s | 99.5% |
| CLI command (read) | < 200ms | < 500ms | < 1s | 99.9% |
| CLI command (write) | < 1s | < 3s | < 5s | 99.5% |

### 1.3 System-Wide

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| Overall uptime | 99.9% | 30 days |
| Mean Time Between Failures (MTBF) | > 720 hours (30 days) | — |
| Mean Time To Recovery (MTTR) | < 30 minutes | Per incident |
| Error rate | < 0.1% | 5 minutes |
| Hub → Bridge sync latency | < 30s | — |

---

## 2. Performance Budgets

### 2.1 Bridge Request Breakdown (Target)

For a typical SELECT query (no FK expansion):

| Phase | Budget | % of Total |
|-------|--------|-----------|
| Network (client → Bridge) | 10ms | 20% |
| Auth & rate limit check | 5ms | 10% |
| Permission evaluation (CEL) | 5ms | 10% |
| SQL generation | 2ms | 4% |
| Database query execution | 20ms | 40% |
| Result serialization (JSON) | 3ms | 6% |
| Network (Bridge → client) | 5ms | 10% |
| **Total** | **50ms** | **100%** |

**Critical Path Optimization:**
- Database query execution (40%) — Add indexes, optimize query plans
- Network latency (30%) — Deploy Bridge close to users, use CDN for static assets
- Permission evaluation (10%) — Cache CEL evaluation results

### 2.2 Hub Schema Apply Breakdown (Target)

For applying 10 tables:

| Phase | Budget | % of Total |
|-------|--------|-----------|
| Schema parsing (YAML → IR) | 100ms | 3% |
| Schema diff calculation | 200ms | 7% |
| DDL generation (SQL) | 100ms | 3% |
| Database migration execution | 2s | 67% |
| Release payload creation | 300ms | 10% |
| Audit log write | 100ms | 3% |
| Notify Bridge instances | 200ms | 7% |
| **Total** | **3s** | **100%** |

**Critical Path Optimization:**
- Database migration (67%) — Use CONCURRENTLY for indexes, batch ALTER TABLE
- Schema diff (7%) — Cache previous schema snapshot

---

## 3. Benchmarking Methodology

### 3.1 Load Testing Tool

**Primary:** k6 (Grafana k6)
**Alternative:** Apache JMeter, Locust

### 3.2 Test Scenarios

#### Scenario 1: Baseline CRUD Performance

**Goal:** Measure p50/p95/p99 latency for basic CRUD operations

**Setup:**
- Bridge: 3 instances (2 vCPU, 4 GB RAM)
- Database: PostgreSQL 15 (4 vCPU, 32 GB RAM)
- Table: `users` (10 columns, 100,000 rows, indexed on `email`)

**Load Profile:**
```javascript
export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100 VUs
    { duration: '5m', target: 100 },   // Hold at 100 VUs
    { duration: '2m', target: 0 },     // Ramp down
  ],
};
```

**Metrics:**
- Request rate (req/s)
- Latency (p50, p95, p99)
- Error rate (%)
- DB connection pool usage (%)

**Pass Criteria:**
- p95 latency < 200ms
- Error rate < 0.1%
- DB pool usage < 80%

---

#### Scenario 2: FK Expansion Performance

**Goal:** Measure impact of FK expansion depth on latency

**Setup:**
- Tables: `posts` → `users` → `teams` → `orgs`
- FK depth: 0, 1, 2, 3 levels

**Test:**
```javascript
// Level 0: No expansion
http.get('/db/posts/select', { headers: { Authorization: `Bearer ${API_KEY}` } });

// Level 1: Expand author
http.post('/db/posts/select', JSON.stringify({
  expand: ['author']
}), { headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' } });

// Level 3: Expand author → team → org
http.post('/db/posts/select', JSON.stringify({
  expand: ['author.team.org']
}), { headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' } });
```

**Pass Criteria:**
- Level 0: p95 < 200ms
- Level 1: p95 < 300ms
- Level 2: p95 < 400ms
- Level 3: p95 < 500ms

---

#### Scenario 3: Spike Test (DDoS Simulation)

**Goal:** Verify rate limiting and graceful degradation under spike load

**Load Profile:**
```javascript
export let options = {
  stages: [
    { duration: '1m', target: 100 },    // Normal load
    { duration: '10s', target: 5000 },  // Spike to 5000 VUs
    { duration: '1m', target: 100 },    // Back to normal
  ],
};
```

**Pass Criteria:**
- Bridge doesn't crash (responds with 429 or 503, not crash)
- Legitimate requests (within rate limit) still succeed
- Recovery time < 1 minute after spike ends

---

#### Scenario 4: Soak Test (Long-Running Stability)

**Goal:** Verify no memory leaks or performance degradation over time

**Load Profile:**
```javascript
export let options = {
  stages: [
    { duration: '5m', target: 200 },    // Ramp to steady load
    { duration: '6h', target: 200 },    // Hold for 6 hours
    { duration: '5m', target: 0 },      // Ramp down
  ],
};
```

**Metrics:**
- Memory usage over time (should remain stable)
- Latency over time (should not degrade)
- Error rate (should remain < 0.1%)

**Pass Criteria:**
- Memory usage increase < 10% over 6 hours
- p95 latency variance < 10%

---

### 3.3 Database Query Performance

#### Query Optimization Checklist

**For each critical query:**
1. Run `EXPLAIN ANALYZE` to see query plan
2. Verify indexes are used (no `Seq Scan` on large tables)
3. Check for N+1 queries (use JOIN or batch loading)
4. Verify query result set size is reasonable (< 10,000 rows)

**Example:**
```sql
EXPLAIN ANALYZE
SELECT u.id, u.name, u.email
FROM users u
WHERE u.status = 'active'
  AND u.created_at > NOW() - INTERVAL '30 days';

-- Expected plan:
-- Index Scan using idx_users_status_created_at on users u
--   Index Cond: (status = 'active' AND created_at > ...)
--   Planning Time: 0.5ms
--   Execution Time: 15ms
```

**If `Seq Scan` detected:**
```yaml
# Add index to tables/users.yaml
indexes:
  - name: idx_users_status_created_at
    columns: [status, created_at]
```

---

## 4. Performance Monitoring

### 4.1 Key Metrics

**Bridge:**
- `stk_bridge_request_duration_seconds` (histogram) — Request latency
- `stk_bridge_requests_total` (counter) — Total requests
- `stk_bridge_errors_total` (counter) — Total errors
- `stk_bridge_db_query_duration_seconds` (histogram) — Database query time
- `stk_bridge_db_pool_active` (gauge) — Active DB connections
- `stk_bridge_permission_eval_duration_seconds` (histogram) — CEL evaluation time

**Hub:**
- `stk_hub_schema_apply_duration_seconds` (histogram) — Schema apply time
- `stk_hub_releases_created_total` (counter) — Releases created
- `stk_hub_audit_log_write_duration_seconds` (histogram) — Audit log write time

**Database:**
- `pg_stat_statements.mean_exec_time` — Average query execution time
- `pg_stat_database.tup_fetched` — Rows fetched
- `pg_stat_user_indexes.idx_scan` — Index scans (verify indexes used)

### 4.2 Alerting Rules (Prometheus)

```yaml
groups:
  - name: performance_slos
    rules:
      # SLO: Bridge p95 latency < 500ms
      - alert: BridgeLatencyHigh
        expr: histogram_quantile(0.95, rate(stk_bridge_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Bridge p95 latency > 500ms (current: {{ $value }}s)"

      # SLO: Error rate < 0.1%
      - alert: HighErrorRate
        expr: (rate(stk_bridge_errors_total[5m]) / rate(stk_bridge_requests_total[5m])) > 0.001
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 0.1% (current: {{ $value | humanizePercentage }})"

      # SLO: DB query time < 50ms (p95)
      - alert: SlowDatabaseQueries
        expr: histogram_quantile(0.95, rate(stk_bridge_db_query_duration_seconds_bucket[5m])) > 0.05
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "DB query p95 > 50ms (current: {{ $value }}s)"

      # SLO: Hub schema apply < 10s (p95)
      - alert: SlowSchemaApply
        expr: histogram_quantile(0.95, rate(stk_hub_schema_apply_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Schema apply p95 > 10s (current: {{ $value }}s)"
```

### 4.3 Dashboards

**Grafana Dashboard: Bridge Performance**

Panels:
1. **Request Rate** (graph) — `rate(stk_bridge_requests_total[1m])`
2. **Latency Percentiles** (graph) — p50, p95, p99 over time
3. **Error Rate** (graph) — `rate(stk_bridge_errors_total[1m]) / rate(stk_bridge_requests_total[1m])`
4. **DB Query Time** (graph) — p95 query latency
5. **DB Connection Pool** (gauge) — Active / Max connections
6. **Top Slow Queries** (table) — Queries > 1s execution time

**Grafana Dashboard: Hub Performance**

Panels:
1. **Schema Apply Duration** (graph) — p95 over time
2. **Release Creation Rate** (graph) — Releases/hour
3. **Audit Log Write Latency** (graph) — p95
4. **Active Operator Sessions** (gauge)

---

## 5. Performance Optimization Strategies

### 5.1 Database Optimization

**1. Indexing:**
- Add indexes for frequently queried columns (WHERE, ORDER BY, JOIN)
- Use composite indexes for multi-column queries
- Monitor index usage: `pg_stat_user_indexes`

**2. Query Optimization:**
- Avoid SELECT * (fetch only needed columns)
- Use LIMIT for pagination (don't fetch all rows)
- Batch INSERT/UPDATE (reduce round-trips)

**3. Connection Pooling:**
- Tune `max_connections` on PostgreSQL
- Tune `pool_size` on Bridge instances
- Use connection pooling middleware (PgBouncer for high concurrency)

**4. Caching:**
- Cache frequently read data (Redis)
- Cache permission evaluation results (short TTL, 1 minute)
- Cache schema metadata (Bridge local cache)

---

### 5.2 Bridge Optimization

**1. Reduce Permission Check Overhead:**
- Cache CEL evaluation results per (user, table, operation)
- Precompile CEL expressions at release load time

**2. Optimize JSON Serialization:**
- Use fast JSON library (serde_json for Rust)
- Stream large result sets (don't buffer all in memory)

**3. Use HTTP/2:**
- Enable HTTP/2 for multiplexing (reduce connection overhead)
- Use server push for related resources (future)

---

### 5.3 Hub Optimization

**1. Parallelize Schema Apply:**
- Apply independent tables in parallel
- Use PostgreSQL transactional DDL (BEGIN; ALTER TABLE; COMMIT;)

**2. Batch Audit Log Writes:**
- Buffer audit entries, flush every 100ms or 100 entries
- Use PostgreSQL `COPY` for bulk insert

**3. Optimize Release Payload:**
- Compress release JSON (gzip)
- Cache release payload in Redis (reduce Hub DB queries)

---

## 6. Performance Testing in CI/CD

### 6.1 Automated Performance Tests

**On PR:**
- Run smoke test (10 VUs, 1 minute) to catch regressions

**On main branch:**
- Run full load test suite (nightly)
- Compare against baseline (fail if p95 latency degrades > 10%)

**Before release:**
- Run soak test (6 hours) to verify stability

### 6.2 Performance Regression Detection

**Baseline Storage:**
- Store performance metrics in time-series DB (Prometheus)
- Tag by Git commit SHA

**Regression Detection:**
```bash
# Compare current PR vs. main branch baseline
k6 run --out prometheus=remote_url \
  --tag commit=$CI_COMMIT_SHA \
  tests/performance/crud_load_test.js

# Query Prometheus for comparison
BASELINE=$(curl -G "http://prometheus:9090/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, stk_bridge_request_duration_seconds{branch="main"})' \
  | jq -r '.data.result[0].value[1]')

CURRENT=$(curl -G "http://prometheus:9090/api/v1/query" \
  --data-urlencode "query=histogram_quantile(0.95, stk_bridge_request_duration_seconds{commit=\"$CI_COMMIT_SHA\"})" \
  | jq -r '.data.result[0].value[1]')

# Fail if regression > 10%
REGRESSION=$(echo "scale=2; ($CURRENT - $BASELINE) / $BASELINE * 100" | bc)
if (( $(echo "$REGRESSION > 10" | bc -l) )); then
  echo "Performance regression detected: ${REGRESSION}%"
  exit 1
fi
```

---

## 7. Capacity Planning

### 7.1 Scaling Triggers

**Scale Up (add more Bridge instances) when:**
- CPU utilization > 70% sustained for 5 minutes
- Request queue depth > 1,000
- DB connection pool saturation > 80%

**Scale Down when:**
- CPU utilization < 30% for 15 minutes
- Request rate drops below baseline

### 7.2 Capacity Model

**Bridge Instance Capacity:**
- 1 instance (2 vCPU, 4 GB RAM) = ~500 req/s (simple CRUD)
- 1 instance (4 vCPU, 8 GB RAM) = ~1,000 req/s

**Database Capacity:**
- PostgreSQL (4 vCPU, 32 GB RAM) = ~5,000 req/s (simple queries)
- PostgreSQL (16 vCPU, 128 GB RAM) = ~20,000 req/s

**Formula:**
```
Required Bridge Instances = Peak RPS / (500 req/s per instance) * 1.5 (headroom)
Required DB vCPUs = Peak RPS / (1,250 req/s per vCPU) * 2 (headroom)
```

**Example:**
- Peak traffic: 10,000 req/s
- Bridge instances: 10,000 / 500 * 1.5 = 30 instances
- DB vCPUs: 10,000 / 1,250 * 2 = 16 vCPUs

---

## 8. Related Documents

- **`plan/spec/limits.md`** — System limits and capacity planning
- **`plan/spec/observability.md`** — Metrics, logs, traces
- **`plan/flows/incident-response.md`** — Performance troubleshooting
- **`plan/implement/testing.md`** — Performance testing strategy

---

## Summary

**Performance Goals:**
1. **Fast by default** — p95 < 500ms for common operations
2. **Predictable** — Stable latency under varying load
3. **Scalable** — Linear scaling with instance count
4. **Observable** — Rich metrics for troubleshooting
5. **Resilient** — Graceful degradation under overload

**Golden Rule:** Measure before optimizing. Use profiling and benchmarks to identify bottlenecks, don't guess.
