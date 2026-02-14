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

## Caller Intent
- Safely write array-typed columns while ensuring item types match declared schema.

## Execution Semantics
- Bridge validates array value shape for insert/update before SQL execution.
- Item type checks are applied per column declaration (`items` type contract).
- Validation failure short-circuits request and prevents partial DB mutation.

## Observable Outcome
- Valid array payload persists successfully.
- Mixed-type or wrong item-type payload returns client validation error.

## API Usage
- `POST /call` with `{"path":"db/users/insert","params":{"data":{"tags":["a","b"],"scores":[1,2]}}}`
- `POST /call` with `{"path":"db/users/update","params":{"where":{"id":"..."},"data":{"scores":["oops"]}}}`

## Acceptance
- Mixed-type or mismatched item arrays return `400 BAD_REQUEST`.

## Failure Modes
- Non-array value for array column: request rejected.
- Nested item type mismatch: request rejected.
