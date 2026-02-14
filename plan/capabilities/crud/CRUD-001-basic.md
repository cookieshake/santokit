---
id: CRUD-001
domain: crud
title: Basic insert/select and generated ID behavior
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_basic
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_basic"]
---

## Intent
Provide baseline CRUD contract for insert and select with schema-safe defaults.

## API Usage
- `POST /call` with `{"path":"db/users/insert","params":{"values":{"email":"a@b.com"}}}`
- `POST /call` with `{"path":"db/users/select","params":{"where":{"email":"a@b.com"}}}`

## Acceptance
- Insert returns row with generated ID and select returns matching rows.
