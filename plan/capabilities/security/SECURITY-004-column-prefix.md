---
id: SECURITY-004
domain: security
title: Enforce column visibility by policy with prefixed fields
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/conventions.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_prefix
code_refs:
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_column_prefix"]
---

## Intent
Ensure restricted fields are omitted for lower-privilege readers.

## Caller Intent
- Present role-appropriate data views without exposing sensitive columns.

## Execution Semantics
- Column allowlist for role is computed from permissions policy.
- Bridge projects query/result set to allowed columns before response serialization.
- Different credentials over same row can observe different column subsets.

## Observable Outcome
- Admin sees full or broader field set.
- Restricted roles receive redacted/omitted sensitive-prefixed columns.

## API Usage
- `POST /call` as admin and viewer for same row and compare visible columns

## Acceptance
- Viewer cannot see restricted prefixed columns while admin can.

## Failure Modes
- Policy omits required operational column: caller sees incomplete data by design.
- Role not matched by rule set: access denied.
