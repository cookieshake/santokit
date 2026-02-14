---
id: SECURITY-001
domain: security
title: Inject CEL condition into row-level SQL filtering
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_cel_condition
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_cel_condition"]
---

## Intent
Enforce owner-like access control by translating supported CEL resource checks.

## API Usage
- `POST /call` with end-user bearer token and `{"path":"db/users/select"}` under CEL condition policy

## Acceptance
- User can see/update only rows allowed by condition-derived filter.
