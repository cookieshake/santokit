---
id: SECURITY-005
domain: security
title: Enforce explicit column-level permissions
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_permissions
code_refs:
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_column_permissions"]
---

## Intent
Restrict selectable/writable columns using `permissions.yaml` column lists.

## API Usage
- `POST /call` as admin and basic role with `{"path":"db/users/select","params":{}}`

## Acceptance
- Basic role sees limited columns and admin sees broader allowed set.
