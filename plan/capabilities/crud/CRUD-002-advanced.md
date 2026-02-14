---
id: CRUD-002
domain: crud
title: Advanced update/delete behavior and safety gates
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_advanced
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_advanced"]
---

## Intent
Handle update/delete with guarded behavior under explicit row targeting.

## Caller Intent
- Perform controlled mutation/deletion on selected rows while avoiding accidental bulk changes.

## Execution Semantics
- Update/delete require valid `where` targeting and pass permission checks.
- Mutation is translated to parameterized SQL and executed in target connection context.
- Response reflects affected row IDs/count semantics defined by runtime.

## Observable Outcome
- Target row is updated/deleted when `where` matches and permissions allow.
- Unsafe or invalid mutation requests are blocked before DB write.

## API Usage
- `POST /call` with `{"path":"db/users/update","params":{"data":{...},"where":{"id":"..."}}}`
- `POST /call` with `{"path":"db/users/delete","params":{"where":{"id":"..."}}}`

## Acceptance
- Update and delete operate correctly on target row by `where` clause.

## Failure Modes
- Empty or missing `where` for guarded operations: request rejected.
- Unknown updatable/deletable column usage: request rejected.
