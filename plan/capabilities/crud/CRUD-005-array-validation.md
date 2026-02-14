---
id: CRUD-005
domain: crud
title: Validate array column item types on insert and update
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_array_validation
code_refs:
  - packages/services/bridge/
---

## Intent
Allows callers to safely write array-typed columns by validating item types against the declared schema before any DB mutation, surfacing clear errors early on malformed payloads.

## Execution Semantics
- Bridge validates array value shape for insert/update before SQL execution.
- Item type checks are applied per column declaration (`items` type contract).
- Validation failure short-circuits request and prevents partial DB mutation.

## Observable Outcome
- Valid array payload persists successfully.
- Mixed-type or wrong item-type payload returns client validation error.

## Usage
- `POST /call` with `{"path":"db/users/insert","params":{"data":{"tags":["a","b"],"scores":[1,2]}}}`
- `POST /call` with `{"path":"db/users/update","params":{"where":{"id":"..."},"data":{"scores":["oops"]}}}`

## Acceptance Criteria
- [ ] Insert with a correctly typed array value returns HTTP 200 and the row is persisted with the array contents intact.
- [ ] Update with a correctly typed array value returns HTTP 200 and the column reflects the new array in subsequent selects.
- [ ] Insert with an array whose items do not match the declared item type returns HTTP 400 and no row is written to the database.
- [ ] Update with a mixed-type array (some items of wrong type) returns HTTP 400 and the existing row is not modified.
- [ ] Insert supplying a non-array value for an array-typed column returns HTTP 400.
- [ ] Insert with a nested item type mismatch returns HTTP 400 with a validation error describing the offending column.

## Failure Modes
- Non-array value for array column: request rejected.
- Nested item type mismatch: request rejected.
