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

## API Usage
- `POST /call` with `{"path":"db/users/update","params":{"data":{...},"where":{"id":"..."}}}`
- `POST /call` with `{"path":"db/users/delete","params":{"where":{"id":"..."}}}`

## Acceptance
- Update and delete operate correctly on target row by `where` clause.
