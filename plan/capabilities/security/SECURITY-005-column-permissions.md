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

## Caller Intent
- Enforce least-privilege field access per role for read and write operations.

## Execution Semantics
- Authorization computes allowed columns per operation from policy rules.
- Select response is projected; write payload is validated against allowed column set.
- Violations are rejected before SQL write or response emission.

## Observable Outcome
- Basic role receives limited fields and cannot mutate forbidden columns.
- Admin role can operate broader allowed field set.

## API Usage
- `POST /call` as admin and basic role with `{"path":"db/users/select","params":{}}`

## Acceptance
- Basic role sees limited columns and admin sees broader allowed set.

## Failure Modes
- Disallowed column in insert/update payload: request rejected.
- Policy references non-existent column: rule evaluation fails.
