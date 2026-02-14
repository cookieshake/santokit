---
id: LOGICS-006
domain: logics
title: Enforce role guard on logic execution
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_admin_only
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_admin_only"]
---

## Intent
Restrict specific logic routes to authorized roles only.

## API Usage
- `POST /call` with `{"path":"logics/admin_only"}` as end-user and as admin key

## Acceptance
- Non-admin request is denied and admin request succeeds.
