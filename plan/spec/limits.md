# System Limits & Capacity Planning

This document defines hard and soft limits for the Santokit platform, along with capacity planning guidelines and monitoring recommendations.

---

## 1. Hard Limits (Enforced)

These limits are enforced by the system and cannot be exceeded without code changes.

### 1.1 Hub (Control Plane)

| Resource | Limit | Configurable | Error Code | Rationale |
|----------|-------|--------------|------------|-----------|
| Orgs per instance | 1,000 | No | CONFLICT | Metadata DB sizing |
| Teams per org | 100 | No | CONFLICT | RBAC complexity |
| Projects per org | 500 | No | CONFLICT | Reasonable org size |
| Envs per project | 10 | No | CONFLICT | (dev/staging/prod + ephemeral) |
| Connections per project | 10 | Yes | CONFLICT | BYO DB limit |
| Tables per connection | 500 | Yes | BAD_REQUEST | Schema metadata size |
| Columns per table | 200 | Yes | BAD_REQUEST | PostgreSQL practical limit ~1600 |
| API keys per project-env | 100 | No | CONFLICT | Key management overhead |
| Service tokens per project | 20 | No | CONFLICT | Bridge instances + CI/CD |
| Releases per env (history) | 1,000 | No | — | Auto-pruned after 90 days |
| Audit log retention | 90 days | Yes | — | Compliance requirement |
| Operators per org | 500 | No | CONFLICT | Team size |

**Configuration:**
```yaml
# config/hub.yaml
limits:
  connections_per_project: 10
  tables_per_connection: 500
  columns_per_table: 200
  audit_retention_days: 90
```

---

### 1.2 Bridge (Data Plane)

| Resource | Limit | Configurable | Error Code | Rationale |
|----------|-------|--------------|------------|-----------|
| Concurrent requests | 10,000 | Yes | TOO_MANY_REQUESTS | Connection pool + memory |
| Request body size | 10 MB | Yes | BAD_REQUEST | Prevent memory exhaustion |
| Response body size | 50 MB | Yes | INTERNAL_ERROR | Network timeout risk |
| Query timeout | 30s | Yes | INTERNAL_ERROR | Prevent long-running queries |
| DB connection pool size | 100 per connection | Yes | SERVICE_UNAVAILABLE | PostgreSQL max_connections |
| Rate limit (per API key) | 1,000 req/min | Yes | TOO_MANY_REQUESTS | Abuse prevention |
| Rate limit (per End User) | 100 req/min | Yes | TOO_MANY_REQUESTS | Fair usage |
| FK expansion depth | 3 levels | Yes | BAD_REQUEST | N+1 query protection |
| Result set size (SELECT) | 10,000 rows | Yes | BAD_REQUEST | Memory + network |
| WHERE clause complexity | 50 conditions | Yes | BAD_REQUEST | Query planner overhead |
| IN clause items | 1,000 items | Yes | BAD_REQUEST | SQL parameter limit |
| Batch insert size | 1,000 rows | Yes | BAD_REQUEST | Transaction size |
| Release cache max_stale | 1 hour | Yes | SERVICE_UNAVAILABLE | Hub unreachable tolerance |

**Configuration:**
```yaml
# config/bridge.yaml (env vars)
STK_MAX_CONCURRENT_REQUESTS=10000
STK_REQUEST_BODY_MAX_SIZE_MB=10
STK_RESPONSE_BODY_MAX_SIZE_MB=50
STK_QUERY_TIMEOUT_SECONDS=30
STK_DB_POOL_MAX_SIZE=100
STK_RATE_LIMIT_PER_API_KEY=1000  # per minute
STK_RATE_LIMIT_PER_END_USER=100  # per minute
STK_FK_EXPANSION_MAX_DEPTH=3
STK_SELECT_MAX_ROWS=10000
STK_WHERE_MAX_CONDITIONS=50
STK_RELEASE_CACHE_MAX_STALE_SECONDS=3600
```

---

### 1.3 Events (Pub/Sub & Cron)

| Resource | Limit | Configurable | Error Code | Rationale |
|----------|-------|--------------|------------|-----------|
| Topics per project-env | 100 | No | CONFLICT | Metadata management |
| Subscriptions per topic | 50 | No | CONFLICT | Fanout complexity |
| Event payload size | 1 MB | Yes | BAD_REQUEST | Pub/Sub message size |
| Event retention | 7 days | Yes | — | Replay window |
| Publish rate (per topic) | 10,000/min | Yes | TOO_MANY_REQUESTS | Queue saturation |
| Handler timeout | 30s | Yes | INTERNAL_ERROR | Same as query timeout |
| Max retries | 10 | Yes | — | DLQ threshold |
| DLQ retention | 14 days | Yes | — | Debugging window |
| Cron schedules per env | 100 | No | CONFLICT | Scheduler overhead |
| Concurrent cron executions | 10 per schedule | No | — | Prevent overlap storms |

**Configuration:**
```yaml
# config/events.yaml
limits:
  topics_per_env: 100
  subscriptions_per_topic: 50
  event_payload_max_size_mb: 1
  event_retention_days: 7
  publish_rate_per_topic_per_minute: 10000
  handler_timeout_seconds: 30
  max_retries: 10
  dlq_retention_days: 14
  cron_schedules_per_env: 100
```

---

### 1.4 Storage (S3 Presigned URLs)

| Resource | Limit | Configurable | Error Code | Rationale |
|----------|-------|--------------|------------|-----------|
| Buckets per project-env | 50 | No | CONFLICT | Management overhead |
| File size (presigned upload) | 5 GB | Yes | BAD_REQUEST | S3 multipart limit |
| Presigned URL TTL | 1 hour | Yes | — | Security (short-lived) |
| Concurrent uploads per user | 10 | Yes | TOO_MANY_REQUESTS | Abuse prevention |

**Configuration:**
```yaml
# config/storage.yaml
limits:
  buckets_per_env: 50
  max_file_size_gb: 5
  presigned_url_ttl_seconds: 3600
  concurrent_uploads_per_user: 10
```

---

### 1.5 Custom Logic (SQL Functions)

| Resource | Limit | Configurable | Error Code | Rationale |
|----------|-------|--------------|------------|-----------|
| Logic functions per project-env | 100 | No | CONFLICT | Namespace management |
| Function timeout | 30s | Yes | INTERNAL_ERROR | Same as query timeout |
| Nested function calls | 5 levels | Yes | INTERNAL_ERROR | Stack overflow risk |
| Transaction size | 10,000 rows modified | Yes | INTERNAL_ERROR | Lock contention |

**Configuration:**
```yaml
# config/logics.yaml
limits:
  functions_per_env: 100
  function_timeout_seconds: 30
  max_nested_calls: 5
  transaction_max_rows: 10000
```

---

## 2. Soft Limits (Warnings)

These limits are not enforced, but crossing them triggers warnings or alerts.

| Resource | Warning Threshold | Recommendation | Monitoring Metric |
|----------|------------------|----------------|-------------------|
| DB connection pool usage | > 80% | Scale horizontally or increase pool | `stk_bridge_db_pool_active / max` |
| Query duration | > 5s | Add indexes, optimize query | `stk_bridge_query_duration_seconds{p95}` |
| Release cache age | > 5 minutes | Check Hub connectivity | `stk_bridge_release_cache_age_seconds` |
| Audit log growth | > 1M entries/day | Adjust retention or export | `stk_hub_audit_log_entries_total` |
| DLQ size | > 1,000 events | Investigate subscription failures | `stk_events_dlq_size` |
| Storage bucket usage | > 80% of quota | Increase quota or archive old files | `stk_storage_bucket_usage_bytes` |
| Tables per connection | > 300 | Consider splitting into multiple connections | `stk_hub_tables_per_connection` |
| API keys per project | > 50 | Review and revoke unused keys | `stk_hub_api_keys_per_project` |
| Failed auth attempts | > 100/min | Possible brute-force attack | `stk_bridge_auth_failures_total` |

**Alert Configuration (Prometheus):**
```yaml
# alerts/soft-limits.yml
groups:
  - name: capacity_warnings
    rules:
      - alert: HighDBPoolUsage
        expr: stk_bridge_db_pool_active / stk_bridge_db_pool_max > 0.8
        for: 5m
        annotations:
          summary: "DB pool usage > 80% (env: {{ $labels.env }})"
          recommendation: "Scale Bridge or increase pool size"

      - alert: SlowQueries
        expr: histogram_quantile(0.95, stk_bridge_query_duration_seconds) > 5
        for: 5m
        annotations:
          summary: "Query p95 latency > 5s (env: {{ $labels.env }})"
          recommendation: "Check slow query log, add indexes"

      - alert: StaleCacheDetected
        expr: stk_bridge_release_cache_age_seconds > 300
        for: 1m
        annotations:
          summary: "Release cache age > 5 minutes (env: {{ $labels.env }})"
          recommendation: "Check Hub connectivity"
```

---

## 3. Capacity Planning Guidelines

### 3.1 Bridge Sizing

#### Rule of Thumb

**Single Bridge Instance (2 vCPU, 4 GB RAM) handles:**
- ~500 req/s (simple CRUD, no FK expansion)
- ~200 req/s (with FK expansion, 1-2 levels)
- ~50 concurrent long-running queries (5-10s each)

**Scaling Characteristics:**
- **CPU-bound**: Permission evaluation (CEL), query planning
- **Memory-bound**: Result set buffering, query plan cache
- **Network-bound**: Large response bodies (>1 MB)

#### DB Connection Pool Sizing

**Formula:**
```
pool_size = (vCPU * 2) + effective_spindle_count

For cloud DBs:
pool_size = vCPU * 4

Example:
- Bridge: 4 vCPU
- PostgreSQL: 8 vCPU
- Pool size: 4 * 4 = 16 connections per Bridge instance
- Total (10 instances): 160 connections
- PostgreSQL max_connections: 200 (20% headroom)
```

**Calculation Spreadsheet:**
| Bridge Instances | vCPU per Instance | Pool Size per Instance | Total Connections | PostgreSQL vCPU | Max Connections Required |
|-----------------|-------------------|----------------------|-------------------|----------------|-------------------------|
| 5 | 2 | 8 | 40 | 4 | 60 |
| 10 | 2 | 8 | 80 | 8 | 100 |
| 20 | 4 | 16 | 320 | 16 | 400 |

#### Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU utilization | > 70% sustained (5 min) | Scale up (more vCPU) or scale out (more instances) |
| Memory utilization | > 85% | Scale up (more RAM) or reduce query result set size |
| Request latency p95 | > 500ms | Investigate slow queries, add indexes, or scale up |
| DB pool saturation | > 80% | Increase pool size or scale horizontally |
| Request queue depth | > 1,000 | Scale out (add more instances) |

#### Example Sizing Scenarios

**Scenario 1: Small Project (Dev/Staging)**
- Traffic: ~10 req/s
- Users: 10 developers
- **Recommended**: 1 Bridge instance (1 vCPU, 2 GB RAM)
- DB pool: 4 connections
- Cost: Low

**Scenario 2: Medium Project (Production)**
- Traffic: ~200 req/s
- Users: 10,000 end users
- **Recommended**: 3 Bridge instances (2 vCPU, 4 GB RAM each)
- DB pool: 8 connections per instance (24 total)
- Load balancer: Round-robin
- Cost: Medium

**Scenario 3: Large Project (High Traffic)**
- Traffic: ~2,000 req/s
- Users: 100,000 end users
- **Recommended**: 10 Bridge instances (4 vCPU, 8 GB RAM each)
- DB pool: 16 connections per instance (160 total)
- Load balancer: Least-connections
- PostgreSQL: 16 vCPU, 64 GB RAM
- Cost: High

---

### 3.2 Hub Sizing

#### Rule of Thumb

**Single Hub Instance (2 vCPU, 4 GB RAM) handles:**
- ~50 concurrent operators (CLI + Web UI)
- ~1,000 schema applies/day
- ~10,000 audit log writes/day
- ~100 releases/day

**Scaling Characteristics:**
- **CPU-bound**: Schema diff calculation, DDL generation
- **Memory-bound**: Release metadata caching
- **I/O-bound**: Audit log writes (batch inserts)

#### Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Schema apply duration | > 30s | Investigate DB performance, add indexes |
| Audit log write lag | > 10s | Scale Hub DB (more IOPS) |
| Concurrent operator sessions | > 100 | Scale out (add Hub replicas) |
| Release creation failures | > 5/hour | Check Hub DB health |

#### High Availability

**Hub is stateless** (except for DB):
- Deploy 2+ Hub instances behind load balancer
- Shared PostgreSQL DB (RDS Multi-AZ)
- Session affinity not required (stateless API)

**Example HA Setup:**
```
                   ┌─────────────┐
                   │ Load Balancer│
                   └──────┬──────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
      ┌─────▼─────┐               ┌─────▼─────┐
      │  Hub-1    │               │  Hub-2    │
      │ (Active)  │               │ (Standby) │
      └─────┬─────┘               └─────┬─────┘
            │                           │
            └─────────────┬─────────────┘
                          │
                   ┌──────▼──────┐
                   │  PostgreSQL │
                   │  (Multi-AZ) │
                   └─────────────┘
```

---

### 3.3 PostgreSQL (BYO DB) Sizing

#### Recommended Configurations

**Small (Dev/Staging):**
- **Instance Type**: db.t3.medium (2 vCPU, 4 GB RAM)
- **Storage**: 100 GB SSD
- **Max Connections**: 100
- **Cost**: ~$50/month (AWS RDS)

**Medium (Production):**
- **Instance Type**: db.r5.xlarge (4 vCPU, 32 GB RAM)
- **Storage**: 500 GB SSD (Provisioned IOPS)
- **Max Connections**: 500
- **Backups**: Automated daily, 7-day retention
- **Cost**: ~$500/month (AWS RDS)

**Large (High Traffic):**
- **Instance Type**: db.r5.4xlarge (16 vCPU, 128 GB RAM)
- **Storage**: 2 TB SSD (Provisioned IOPS)
- **Max Connections**: 2,000
- **Backups**: Automated daily, 30-day retention
- **Read Replicas**: 2 (for reporting queries)
- **Cost**: ~$3,000/month (AWS RDS)

#### Connection Budgeting

```
Total PostgreSQL max_connections = 500

Reserved for:
- Bridge instances (10 * 16 = 160)
- Hub instances (2 * 10 = 20)
- Admin/monitoring (5)
- Reserved pool (15)
---
Total used: 200
Headroom: 300 (60%)
```

**Alert if headroom < 20%:**
```yaml
- alert: LowDBConnectionHeadroom
  expr: (pg_stat_database_numbackends / pg_settings_max_connections) > 0.8
  annotations:
    summary: "DB connection usage > 80%"
```

---

### 3.4 Storage (S3) Sizing

#### Presigned URL Generation

- **Capacity**: Virtually unlimited (stateless operation)
- **Latency**: < 10ms (AWS SDK operation)
- **Cost**: $0 (only pay for S3 storage + bandwidth)

#### Bandwidth Planning

**S3 Performance (per bucket):**
- **PUT/POST**: 3,500 requests/second
- **GET/HEAD**: 5,500 requests/second

**If exceeding:**
- Use bucket sharding: `bucket-{hash(userId) % 10}`
- Example: 10 buckets → 35,000 PUT/s, 55,000 GET/s

**Example Traffic:**
- 1,000 concurrent users uploading files
- Average file size: 5 MB
- Upload duration: ~5 seconds
- Requests/second: 1,000 / 5 = 200 PUT/s
- **Verdict**: Well within S3 limits

---

## 4. Monitoring & Alerting

### 4.1 Critical Metrics (P0 Alerts)

These metrics indicate service degradation requiring immediate action.

| Metric | Alert Threshold | Severity | Action |
|--------|----------------|----------|--------|
| `stk_bridge_request_duration_seconds{p95}` | > 1s | P1 | Investigate slow queries, check DB health |
| `stk_bridge_error_rate` | > 5% for 5 min | P1 | Check logs, rollback if needed |
| `stk_bridge_db_pool_saturation` | > 90% | P1 | Scale Bridge or increase pool |
| `stk_bridge_release_cache_age_seconds` | > 600 (10 min) | P1 | Check Hub connectivity |
| `stk_hub_schema_apply_failures_total` | > 5/hour | P2 | Review schema changes, check audit log |
| `stk_hub_down` | Hub unreachable | P0 | Check Hub health, network, DB |
| `stk_events_dlq_size` | > 10,000 | P2 | Investigate handler failures |
| `stk_bridge_permission_denials_total` | > 100/min | P2 | Possible permission misconfiguration |

### 4.2 Warning Metrics (P2 Alerts)

| Metric | Warning Threshold | Action |
|--------|------------------|--------|
| `stk_bridge_query_duration_seconds{p95}` | > 500ms | Optimize queries, add indexes |
| `stk_bridge_db_pool_active / max` | > 80% | Plan capacity increase |
| `stk_hub_audit_log_growth_rate` | > 1M entries/day | Review retention policy |
| `stk_storage_bucket_usage_bytes` | > 80% of quota | Archive or increase quota |
| `stk_bridge_instances_down` | > 20% of fleet | Check deployment health |

### 4.3 Dashboards

**Grafana Dashboard: Bridge Performance**

Panels:
1. Request Rate (req/s)
2. Request Latency (p50/p95/p99)
3. Error Rate (%)
4. DB Connection Pool Usage (%)
5. Cache Hit Rate (%)
6. Permission Check Duration (ms)

**Grafana Dashboard: Hub Operations**

Panels:
1. Schema Applies (count, duration)
2. Release Creations (count)
3. Audit Log Write Rate (entries/s)
4. Active Operator Sessions
5. API Key Usage

**Grafana Dashboard: Capacity Planning**

Panels:
1. Tables per Connection (gauge)
2. Columns per Table (histogram)
3. Concurrent Requests (gauge)
4. DB Connection Headroom (%)
5. Storage Usage per Bucket (bytes)

---

## 5. Scaling Playbooks

### 5.1 Horizontal Scaling (Add Instances)

**When:**
- CPU/memory headroom < 30%
- Request queue depth growing
- Traffic doubling expected

**Steps:**
1. Deploy new Bridge instances (same version as existing)
2. Add to load balancer pool
3. Monitor for 15 minutes (check logs, errors, latency)
4. Gradually shift traffic (10% → 50% → 100%)

**Rollback:** Remove from load balancer, drain connections

### 5.2 Vertical Scaling (Increase Resources)

**When:**
- Single-threaded workload (can't parallelize)
- Memory-intensive operations (large result sets)
- DB connection pool exhausted

**Steps:**
1. Deploy new Bridge instances with larger instance type
2. Add to load balancer
3. Drain old instances (stop accepting new requests)
4. Terminate old instances after draining

**Downtime:** None (blue-green deployment)

### 5.3 Database Scaling

**Read Replicas (for read-heavy workloads):**
1. Create PostgreSQL read replica
2. Configure Bridge to route SELECT queries to replica
3. Monitor replication lag (< 1 second)

**Vertical Scaling (increase DB instance size):**
1. Schedule maintenance window (optional: multi-AZ has minimal downtime)
2. Increase instance type (AWS RDS: few minutes downtime)
3. Verify connection pool settings

**Sharding (for write-heavy workloads):**
- Not supported in initial version
- Future: Shard by project or tenant

---

## 6. Cost Estimation

### 6.1 Small Deployment (1 Project, Dev/Staging)

| Component | Spec | Monthly Cost (AWS) |
|-----------|------|-------------------|
| Bridge (1 instance) | t3.small (2 vCPU, 2 GB) | $15 |
| Hub (1 instance) | t3.small (2 vCPU, 2 GB) | $15 |
| PostgreSQL (BYO DB) | db.t3.medium (2 vCPU, 4 GB) | $50 |
| S3 Storage (100 GB) | Standard | $3 |
| Load Balancer | ALB | $20 |
| **Total** | | **~$103/month** |

### 6.2 Medium Deployment (10 Projects, Production)

| Component | Spec | Monthly Cost (AWS) |
|-----------|------|-------------------|
| Bridge (3 instances) | t3.medium (2 vCPU, 4 GB) | $90 |
| Hub (2 instances) | t3.medium (2 vCPU, 4 GB) | $60 |
| PostgreSQL (BYO DB) | db.r5.xlarge (4 vCPU, 32 GB) | $500 |
| S3 Storage (1 TB) | Standard | $23 |
| Load Balancer | ALB | $20 |
| **Total** | | **~$693/month** |

### 6.3 Large Deployment (100 Projects, High Traffic)

| Component | Spec | Monthly Cost (AWS) |
|-----------|------|-------------------|
| Bridge (10 instances) | c5.xlarge (4 vCPU, 8 GB) | $1,530 |
| Hub (3 instances) | t3.large (2 vCPU, 8 GB) | $150 |
| PostgreSQL (BYO DB) | db.r5.4xlarge (16 vCPU, 128 GB) | $3,000 |
| S3 Storage (10 TB) | Standard | $230 |
| Load Balancer | ALB | $40 |
| **Total** | | **~$4,950/month** |

**Note:** Costs vary by region, commitment (reserved instances), and usage patterns.

---

## 7. Limit Increase Requests

### 7.1 Requesting Limit Increases

**Soft Limits (via configuration):**
- Modify `config/*.yaml` and redeploy
- No approval needed

**Hard Limits (requires code change):**
1. Open GitHub issue: "Request: Increase limit for {resource}"
2. Provide justification (use case, current blocker)
3. Team reviews and approves
4. Code change + release

**Emergency Override (operators only):**
```bash
# Temporarily bypass limit (requires admin role)
stk config set --key limits.tables_per_connection --value 1000 --env prod
```

### 7.2 Common Limit Increase Scenarios

| Scenario | Limit to Increase | Typical New Value |
|----------|------------------|-------------------|
| Large enterprise schema | Tables per connection | 500 → 1,000 |
| Complex permissions | WHERE clause conditions | 50 → 100 |
| High-throughput API | Rate limit per API key | 1,000 → 10,000 req/min |
| Large file uploads | File size (presigned) | 5 GB → 50 GB |
| Bulk data export | Result set size | 10,000 → 100,000 rows |

---

## 8. Related Documents

- **`plan/spec/observability.md`** — Metrics, logs, traces
- **`plan/spec/errors.md`** — Error codes for limit violations
- **`plan/flows/incident-response.md`** — Troubleshooting capacity issues
- **`plan/spec/schema-evolution.md`** — Schema limits and migrations
- **`plan/spec/performance.md`** — Performance SLOs and benchmarks

---

## Summary

**Key Takeaways:**
1. **Hard limits prevent abuse** — Enforced at API layer
2. **Soft limits trigger alerts** — Proactive capacity management
3. **Plan for 2-3x current traffic** — Avoid constant scaling
4. **Monitor headroom** — Alert before hitting limits
5. **Document limit increases** — Track historical changes

**Golden Rule:** Design for failure. Limits exist to protect the system and ensure fair resource allocation.
