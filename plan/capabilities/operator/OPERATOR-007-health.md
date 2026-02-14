---
id: OPERATOR-007
domain: operator
title: Expose health and readiness endpoints
status: planned
depends: [OPERATOR-001]
spec_refs: ["plan/spec/operator.md", "plan/spec/architecture.md"]
test_refs: []
code_refs: []
---

## Intent
Operators and orchestration systems need fast, reliable checks to distinguish process liveness from traffic readiness; this capability exposes dedicated health and readiness endpoints on Hub and Bridge to gate rollouts and surface dependency failures before they become user-facing errors.

## Execution Semantics
- `/healthz` reports basic process liveness.
- `/readyz` reports dependency/readiness state (for example release/config availability).
- Operators and orchestration systems use readiness to gate rollout and traffic routing.

## Observable Outcome
- Healthy services return success on both endpoints.
- Degraded dependencies surface as readiness failures before user-facing errors escalate.

## Usage
- `GET /healthz` (Hub)
- `GET /readyz` (Hub)
- `GET /healthz` (Bridge)
- `GET /readyz` (Bridge)

## Acceptance Criteria
- [ ] `GET /healthz` on Hub returns HTTP 200 when the process is running.
- [ ] `GET /readyz` on Hub returns HTTP 200 when all dependencies (DB, config) are available.
- [ ] `GET /healthz` on Bridge returns HTTP 200 when the process is running.
- [ ] `GET /readyz` on Bridge returns HTTP 200 when release config is loaded and reachable.
- [ ] `GET /readyz` on Hub or Bridge returns a non-200 status when a required dependency is unavailable, while `GET /healthz` may still return HTTP 200.

## Failure Modes
- Downstream dependency not ready: `readyz` fails while `healthz` may still pass.
