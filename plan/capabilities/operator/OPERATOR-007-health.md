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
- `GET /healthz` on both Hub and Bridge reports basic process liveness. It returns HTTP 200 with body `{"ok": true}` as long as the process is running and the HTTP listener is bound, regardless of downstream dependency state.
- `GET /readyz` on Hub checks that Hub's own DB connection is healthy and its configuration is loaded. Returns HTTP 200 with body `{"ok": true}` when all checks pass; returns HTTP 503 when any required dependency is unavailable.
- `GET /readyz` on Bridge checks that the current release config is loaded from Hub and cached in memory, and that the DB connection for the env is reachable. Returns HTTP 200 with body `{"ok": true}` when ready; returns HTTP 503 when release cache is empty (e.g., on cold start before the first sync) or DB is unreachable.
- Hub also exposes `GET /internal/healthz` for internal service mesh checks, returning `{"ok": true}` when the process is alive.
- Orchestration systems (Kubernetes, load balancers) use `/healthz` for liveness probes and `/readyz` for readiness probes to gate traffic routing and rollout progression.

## Observable Outcome
- Healthy services return HTTP 200 on both `/healthz` and `/readyz`.
- Degraded dependencies surface as HTTP 503 on `/readyz` before user-facing errors escalate, while `/healthz` may still return HTTP 200.

## Usage
- `GET /healthz` (Hub)
- `GET /readyz` (Hub)
- `GET /healthz` (Bridge)
- `GET /readyz` (Bridge)
- `GET /internal/healthz` (Hub — internal only)

## Acceptance Criteria
- [ ] `GET /healthz` on Hub returns HTTP 200 with body `{"ok": true}` when the process is running.
- [ ] `GET /readyz` on Hub returns HTTP 200 with body `{"ok": true}` when all dependencies (DB, config) are available.
- [ ] `GET /healthz` on Bridge returns HTTP 200 with body `{"ok": true}` when the process is running.
- [ ] `GET /readyz` on Bridge returns HTTP 200 with body `{"ok": true}` when release config is loaded and DB is reachable.
- [ ] `GET /readyz` on Hub or Bridge returns HTTP 503 when a required dependency is unavailable, while `GET /healthz` may still return HTTP 200.

## Failure Modes
- Hub DB unavailable: `GET /readyz` on Hub returns HTTP 503; `GET /healthz` still returns HTTP 200.
- Bridge release cache empty or DB unreachable: `GET /readyz` on Bridge returns HTTP 503; `GET /healthz` still returns HTTP 200.
