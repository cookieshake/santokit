---
id: OPERATOR-007
domain: operator
title: Expose health and readiness endpoints
status: planned
owners: [hub, bridge]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/ARCHITECTURE.md"]
test_refs: []
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
verify: []
---

## Intent
Enable fast operational checks for service liveness and readiness.

## API Usage
- `GET /healthz` (Hub)
- `GET /readyz` (Hub)
- `GET /healthz` (Bridge)
- `GET /readyz` (Bridge)

## Acceptance
- `/healthz` and `/readyz` return expected status for healthy and degraded cases.
