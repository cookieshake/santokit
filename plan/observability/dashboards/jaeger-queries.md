# Jaeger Trace Queries

Common queries and filters for troubleshooting with Jaeger distributed tracing.

---

## Quick Reference

### 1. Find Slow Requests

**Query:**
- Service: `santokit-bridge`
- Operation: `POST /db/users/select`
- Tags: `http.status_code=200`
- Min Duration: `500ms`

**Use Case:** Identify requests exceeding SLO (p95 < 500ms)

---

### 2. Find Failed Requests

**Query:**
- Service: `santokit-bridge`
- Tags: `error=true` OR `http.status_code>=500`
- Lookback: `Last 1 hour`

**Use Case:** Debug 500 errors

---

### 3. Trace a Specific Request

**Query:**
- Tags: `requestId=<uuid>`

**Use Case:** Follow request from client → Bridge → DB → response

---

### 4. Database Query Performance

**Query:**
- Service: `santokit-bridge`
- Operation: `db.query`
- Min Duration: `100ms`

**Use Case:** Find slow database queries

---

### 5. Permission Check Latency

**Query:**
- Service: `santokit-bridge`
- Operation: `permission.evaluate`
- Min Duration: `50ms`

**Use Case:** Identify slow CEL evaluations

---

### 6. Hub → Bridge Sync Traces

**Query:**
- Service: `santokit-hub`
- Operation: `GET /internal/releases/current`

**Use Case:** Verify release polling working

---

### 7. Event Handler Traces

**Query:**
- Service: `santokit-bridge`
- Operation: `event.handle`
- Tags: `topic=user.created`

**Use Case:** Debug event processing issues

---

## Trace Analysis Workflow

### Step 1: Find Trace ID

**From logs:**
```bash
stk logs bridge --filter "requestId=abc-123" --format json | jq '.traceId'
```

**From metrics:**
- Check high latency in Grafana
- Click data point → View traces
- Trace ID in Jaeger link

### Step 2: Open Trace in Jaeger

```
http://localhost:16686/trace/<trace-id>
```

### Step 3: Analyze Spans

**Look for:**
- Long-running spans (> 100ms)
- Error tags (`error=true`, `http.status_code>=400`)
- Missing spans (incomplete trace)

### Step 4: Correlate with Logs

**Find logs for trace:**
```bash
stk logs bridge --filter "traceId=<trace-id>" --since 1h
```

---

## Common Patterns

### Pattern 1: N+1 Query Problem

**Symptoms:**
- Many sequential `db.query` spans
- Total duration = sum of query times

**Example:**
```
Span: POST /db/posts/select (500ms)
  ├─ db.query SELECT * FROM posts (50ms)
  ├─ db.query SELECT * FROM users WHERE id=1 (10ms)
  ├─ db.query SELECT * FROM users WHERE id=2 (10ms)
  ├─ db.query SELECT * FROM users WHERE id=3 (10ms)
  └─ ... (40 more queries)
```

**Fix:** Use FK expansion to JOIN instead of N queries

---

### Pattern 2: Slow Permission Check

**Symptoms:**
- `permission.evaluate` span > 50ms
- Complex CEL expression

**Example:**
```
Span: POST /db/users/select (600ms)
  ├─ permission.evaluate (200ms)  ← Bottleneck
  └─ db.query (50ms)
```

**Fix:** Simplify CEL or cache evaluation result

---

### Pattern 3: Hub Unreachable

**Symptoms:**
- Missing spans for `/internal/releases/current`
- Error tag: `hub.unreachable=true`

**Example:**
```
Span: release.sync (30s)
  └─ Error: connection timeout to hub.example.com
```

**Fix:** Check Hub health, network connectivity

---

## Advanced Queries

### Find Requests by User

**Tags:**
- `auth.userId=user_123`

### Find Requests by Table

**Tags:**
- `db.table=users`
- Operation: `POST /db/users/select`

### Find Cross-Service Traces

**Query:**
- Service: `santokit-bridge` OR `santokit-hub`
- Min Spans: `5` (ensures multi-service trace)

### Compare Traces (Before/After Optimization)

**Steps:**
1. Query before optimization: `Min Duration: 500ms`, note avg duration
2. Deploy optimization
3. Query after optimization: `Min Duration: 500ms`, compare avg duration
4. Calculate improvement: `(old - new) / old * 100%`

---

## Exporting Traces

### Download Trace JSON

**Via Jaeger UI:**
1. Open trace
2. Click "JSON" button (top-right)
3. Save as `trace-<trace-id>.json`

**Via API:**
```bash
curl "http://localhost:16686/api/traces/<trace-id>" | jq . > trace.json
```

### Share Trace

**Generate shareable link:**
```
http://jaeger.example.com/trace/<trace-id>?uiEmbed=v0
```

---

## Retention & Cleanup

**Jaeger storage retention:**

```yaml
# Cassandra backend
CASSANDRA_KEYSPACE: jaeger
CASSANDRA_SPAN_STORE_TTL: 168h  # 7 days

# Elasticsearch backend
ES_INDEX_ROLLOVER_FREQUENCY: daily
ES_INDEX_DELETE_AFTER: 7d
```

**Archive old traces:**
```bash
# Export important traces for long-term storage
jaeger-cli export --trace-id <trace-id> --output s3://traces-archive/
```

---

## Related Documents

- **`plan/spec/observability.md`** — Tracing architecture
- **`plan/spec/audit-log.md`** — Correlation with audit logs
- **`plan/flows/incident-response.md`** — Using traces for debugging
