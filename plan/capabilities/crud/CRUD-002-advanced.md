---
id: CRUD-002
domain: crud
title: Advanced update/delete behavior and safety gates
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/capabilities/crud/test_crud_002_advanced.py::test_crud_advanced
code_refs:
  - tests/integration_py/tests/capabilities/crud/test_crud_002_advanced.py
---

## Intent
Enables callers to perform controlled mutation and deletion on selected rows while enforcing explicit row targeting to prevent accidental bulk changes.

## Execution Semantics
- Both update and delete enforce a safety gate: the request must include a non-empty `where` clause. A missing `where` or an empty `where` object (`{}`) is rejected with HTTP 400 before any SQL is executed. This prevents unbounded mutations against an entire table.
- Update translates the `data` payload and `where` filter into a parameterized SQL `UPDATE`, applies permission checks on both the target columns and the `where` columns, and executes in the target connection context. The response payload is the full updated row state as reflected in the DB after the mutation.
- Delete translates the `where` filter into a parameterized SQL `DELETE` and returns the count of affected rows, not the deleted row payloads.
- Response shapes differ by operation:
  - Update returns the updated row state: `{ "data": [{ ...updated_row_fields }] }`
  - Delete returns an affected-row count: `{ "data": { "affected": N } }`

## Observable Outcome
- Update: target row reflects new field values after the operation. Response is HTTP 200 with the row payload:
  ```json
  { "data": [{ "id": "01H8XYZABC123", "email": "new@b.com", "created_at": "2026-02-15T00:00:00Z" }] }
  ```
- Delete: target row no longer appears in subsequent selects. Response is HTTP 200 with the affected count:
  ```json
  { "data": { "affected": 1 } }
  ```
- Unsafe or invalid mutation requests are blocked before any DB write.

## Usage
- Update the email of a specific user:
  ```json
  POST /call
  { "path": "db/users/update", "params": { "data": { "email": "new@b.com" }, "where": { "id": "01H8XYZABC123" } } }
  ```
  Response: `{ "data": [{ "id": "01H8XYZABC123", "email": "new@b.com", "created_at": "2026-02-15T00:00:00Z" }] }`

- Delete a specific user:
  ```json
  POST /call
  { "path": "db/users/delete", "params": { "where": { "id": "01H8XYZABC123" } } }
  ```
  Response: `{ "data": { "affected": 1 } }`

## Acceptance Criteria
- [ ] Update with a valid `where` and `data` payload returns HTTP 200 and the response body is `{"data": [...]}` containing the updated row with all its current field values.
- [ ] Delete with a valid `where` returns HTTP 200 and the response body is `{"data": {"affected": N}}` where N reflects the number of deleted rows.
- [ ] After a successful delete, a subsequent select with the same `where` returns an empty `data` array.
- [ ] Update or delete issued without a `where` key returns HTTP 400.
- [ ] Update or delete issued with an empty `where` object (`{}`) returns HTTP 400.
- [ ] Update referencing a column that is not permitted for the caller returns HTTP 403.
- [ ] Update referencing an unknown column in `data` returns HTTP 400.
- [ ] Delete referencing an unknown column in `where` returns HTTP 400.
- [ ] Request with no credential returns HTTP 401.
- [ ] Request targeting a table that does not exist returns HTTP 404.

## Failure Modes
- Missing or empty `where` clause for update or delete: HTTP 400, request rejected before DB write.
- Unknown column in `data` (update) or `where` (update/delete): HTTP 400, request rejected.
- Column in `data` not permitted by caller's permission context: HTTP 403.
- No credential on request: HTTP 401.
- Table or path does not exist: HTTP 404.
