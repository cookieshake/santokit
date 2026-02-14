---
id: SECURITY-005
domain: security
title: Enforce explicit column-level permissions
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_permissions
code_refs:
  - packages/services/bridge/
---

## Intent
Restrict selectable/writable columns using `permissions.yaml` column lists. Enforce least-privilege field access per role for read and write operations.

## Execution Semantics
- Authorization computes allowed columns per operation from policy rules.
- Select response is projected; write payload is validated against allowed column set.
- Violations are rejected before SQL write or response emission.

## Observable Outcome
- Basic role receives limited fields and cannot mutate forbidden columns.
- Admin role can operate broader allowed field set.

## Usage
- `POST /call` as admin and basic role with `{"path":"db/users/select","params":{}}`

## Acceptance Criteria
- [ ] Basic role receives only the columns listed in its `permissions.yaml` rule on select.
- [ ] Admin role receives the broader set of columns listed in its rule.
- [ ] Basic role insert/update with a disallowed column is rejected.

## Failure Modes
- Disallowed column in insert/update payload: request rejected.
- Policy references non-existent column: rule evaluation fails.
