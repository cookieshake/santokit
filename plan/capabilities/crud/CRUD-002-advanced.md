---
id: CRUD-002
domain: crud
title: Advanced update/delete behavior and safety gates
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/crud.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_advanced
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Enables callers to perform controlled mutation and deletion on selected rows while enforcing explicit row targeting to prevent accidental bulk changes.

## Execution Semantics
- Update/delete require valid `where` targeting and pass permission checks.
- Mutation is translated to parameterized SQL and executed in target connection context.
- Response reflects affected row IDs/count semantics defined by runtime.

## Observable Outcome
- Target row is updated/deleted when `where` matches and permissions allow.
- Unsafe or invalid mutation requests are blocked before DB write.

## Usage
- `POST /call` with `{"path":"db/users/update","params":{"data":{...},"where":{"id":"..."}}}`
- `POST /call` with `{"path":"db/users/delete","params":{"where":{"id":"..."}}}`

## Acceptance Criteria
- [ ] Update with a valid `where` and `data` payload returns HTTP 200 and the response reflects the updated row state.
- [ ] Delete with a valid `where` returns HTTP 200 and the targeted row no longer exists in subsequent selects.
- [ ] Update or delete issued without a `where` clause returns HTTP 400.
- [ ] Update or delete issued with an empty `where` object returns HTTP 400.
- [ ] Update referencing a column that is not updatable returns HTTP 400.
- [ ] Delete referencing an unknown column in `where` returns HTTP 400.

## Failure Modes
- Empty or missing `where` for guarded operations: request rejected.
- Unknown updatable/deletable column usage: request rejected.
