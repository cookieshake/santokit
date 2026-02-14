---
id: CRUD-005
domain: crud
title: Validate array column item types on insert and update
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_array_validation
code_refs:
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_array_validation"]
---

## Intent
Reject malformed array payloads early with clear validation errors.

## API Usage
- `POST /call` with `{"path":"db/users/insert","params":{"data":{"tags":["a","b"],"scores":[1,2]}}}`
- `POST /call` with `{"path":"db/users/update","params":{"where":{"id":"..."},"data":{"scores":["oops"]}}}`

## Acceptance
- Mixed-type or mismatched item arrays return `400 BAD_REQUEST`.
