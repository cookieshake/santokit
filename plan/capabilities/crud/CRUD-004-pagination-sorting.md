---
id: CRUD-004
domain: crud
title: Pagination and sorting on select operations
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/conventions.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_pagination_sorting
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_pagination_sorting"]
---

## Intent
Support deterministic page traversal and ordering for list queries.

## API Usage
- `POST /call` with `{"path":"db/users/select","params":{"orderBy":{"email":"asc"},"limit":2,"offset":0}}`

## Acceptance
- `limit`, `offset`, and `orderBy` produce stable expected result ordering.
