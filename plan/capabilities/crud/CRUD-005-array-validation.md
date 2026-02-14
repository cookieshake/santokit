---
id: CRUD-005
domain: crud
title: Validate array column item types on insert and update
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_array_validation
code_refs:
  - packages/services/bridge/
---

## Intent
Allows callers to safely write array-typed columns by validating item types against the declared schema before any DB mutation, surfacing clear errors early on malformed payloads.

## Execution Semantics
- Array columns are declared in `schema.yaml` with `type: array` and an `items` type contract specifying the element type. For example:
  ```yaml
  columns:
    tags:   { type: array, items: string }
    scores: { type: array, items: int }
  ```
- Bridge validates the array value shape for insert and update before any SQL is executed. Each element is checked against the declared `items` type. If any element does not match, the entire request is rejected with HTTP 400 and no partial mutation is written to the DB.
- If the supplied value for an array-typed column is not a JSON array at all (for example a string or a number), Bridge rejects the request with HTTP 400.
- Validation failure includes a column-identifying error message so the caller can locate which column caused the rejection.

## Observable Outcome
- Insert or update with a correctly typed array value returns HTTP 200 and the array is persisted with its contents intact.
- A payload with a wrong item type, a mixed-type array, or a non-array value for an array column returns HTTP 400 and no DB write occurs.
- The error response body identifies the offending column:
  ```json
  { "error": { "code": "BAD_REQUEST", "message": "column 'scores': expected array of int, got string at index 0", "requestId": "..." } }
  ```

## Usage
- Insert a user with valid array columns:
  ```json
  POST /call
  { "path": "db/users/insert", "params": { "values": { "tags": ["a", "b"], "scores": [1, 2] } } }
  ```
  Response: `{ "data": [{ "id": "01H...", "tags": ["a", "b"], "scores": [1, 2] }] }`

- Update with an invalid item type in `scores` (string where int expected):
  ```json
  POST /call
  { "path": "db/users/update", "params": { "where": { "id": "01H..." }, "data": { "scores": ["oops"] } } }
  ```
  Response (HTTP 400): `{ "error": { "code": "BAD_REQUEST", "message": "column 'scores': expected array of int, got string at index 0", "requestId": "..." } }`

## Acceptance Criteria
- [ ] Insert with a correctly typed array value returns HTTP 200 and the row is persisted with the array contents intact.
- [ ] Update with a correctly typed array value returns HTTP 200 and the column reflects the new array in subsequent selects.
- [ ] Insert with an array whose items do not match the declared `items` type returns HTTP 400 and no row is written to the database.
- [ ] Update with a mixed-type array (some items of wrong type) returns HTTP 400 and the existing row is not modified.
- [ ] Insert supplying a non-array value for an array-typed column returns HTTP 400.
- [ ] Insert with a nested item type mismatch returns HTTP 400 with an error message that identifies the offending column name.

## Failure Modes
- Array item type does not match the declared `items` contract: HTTP 400, request rejected before DB write.
- Non-array value supplied for an array-typed column: HTTP 400, request rejected.
- Mixed-type array (any element of wrong type): HTTP 400, request rejected, no partial mutation.
