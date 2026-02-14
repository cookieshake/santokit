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

## Operator Intent
- Distinguish "process is up" from "service can safely serve traffic" during operations.

## Execution Semantics
- `/healthz` reports basic process liveness.
- `/readyz` reports dependency/readiness state (for example release/config availability).
- Operators and orchestration systems use readiness to gate rollout and traffic routing.

## Observable Outcome
- Healthy services return success on both endpoints.
- Degraded dependencies surface as readiness failures before user-facing errors escalate.

## API Usage
- `GET /healthz` (Hub)
- `GET /readyz` (Hub)
- `GET /healthz` (Bridge)
- `GET /readyz` (Bridge)

## Acceptance
- `/healthz` and `/readyz` return expected status for healthy and degraded cases.

## Failure Modes
- Downstream dependency not ready: `readyz` fails while `healthz` may still pass.
