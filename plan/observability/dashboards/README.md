# Observability Dashboards

This directory contains dashboard templates and query examples for monitoring Santokit components.

---

## Contents

1. **grafana-bridge.json** — Grafana dashboard for Bridge metrics
2. **grafana-hub.json** — Grafana dashboard for Hub metrics
3. **jaeger-queries.md** — Common trace queries for Jaeger
4. **alerting-rules.yml** — Prometheus alerting rules

---

## Setup

### Grafana Dashboards

**Import to Grafana:**

```bash
# Via UI
1. Login to Grafana (http://localhost:3000)
2. Navigate to Dashboards → Import
3. Upload grafana-bridge.json or grafana-hub.json
4. Select Prometheus data source
5. Click Import

# Via API
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-bridge.json
```

**Data Source Configuration:**

```yaml
# Prometheus
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    access: proxy
    isDefault: true
```

---

### Prometheus Alerting Rules

**Load rules:**

```bash
# Add to prometheus.yml
rule_files:
  - '/etc/prometheus/alerting-rules.yml'

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload
```

**Verify rules loaded:**

```bash
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].name'
```

---

### Jaeger

**Access Jaeger UI:**

```
http://localhost:16686
```

**Query examples in `jaeger-queries.md`**

---

## Dashboard Variables

### Bridge Dashboard

| Variable | Type | Query | Description |
|----------|------|-------|-------------|
| `$env` | Custom | dev, staging, prod | Environment selector |
| `$instance` | Query | `label_values(stk_bridge_request_duration_seconds, instance)` | Bridge instance |
| `$table` | Query | `label_values(stk_bridge_request_duration_seconds{operation="select"}, table)` | Table name |

### Hub Dashboard

| Variable | Type | Query | Description |
|----------|------|-------|-------------|
| `$env` | Custom | dev, staging, prod | Environment selector |
| `$project` | Query | `label_values(stk_hub_schema_apply_duration_seconds, project)` | Project name |

---

## Customization

### Adding New Panels

**Grafana panel example:**

```json
{
  "title": "Custom Metric",
  "targets": [
    {
      "expr": "rate(your_metric_name[5m])",
      "legendFormat": "{{instance}}"
    }
  ],
  "type": "graph"
}
```

### Modifying Alert Thresholds

Edit `alerting-rules.yml`:

```yaml
- alert: YourAlert
  expr: your_metric > 100  # Change threshold
  for: 5m                  # Change duration
```

---

## Related Documents

- **`plan/spec/observability.md`** — Metrics and logging
- **`plan/spec/limits.md`** — Capacity thresholds
- **`plan/flows/incident-response.md`** — Using dashboards for troubleshooting
