---
id: CRUD-004
domain: crud
title: Pagination and sorting on select operations
status: planned
depends: [CRUD-001]
spec_refs: ["plan/spec/conventions.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_pagination_sorting
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Enables callers to traverse large result sets predictably by applying stable ordering and bounded page windows to select operations.

## Execution Semantics
- Bridge validates `orderBy` keys against the schema's column identifiers for the target table. An unknown column name returns HTTP 400. The direction value must be exactly `"asc"` or `"desc"`; any other value returns HTTP 400.
- `limit` and `offset` are validated before SQL execution. Both must be non-negative integers. A negative `limit` or `offset` value returns HTTP 400. A `limit` of zero is valid and returns an empty `data` array.
- Validated `limit` and `offset` are translated directly to bounded SQL `LIMIT`/`OFFSET` clauses. Combined with `orderBy`, this produces a deterministic page slice when the sort key is stable across calls.

## Observable Outcome
- Returned row count is at most `limit`.
- Rows start from the `offset`-th position in the ordered result set (zero-indexed).
- Repeated calls with identical `orderBy`, `limit`, and `offset` against an unchanged dataset return the same row sequence.

## Usage
- Select the first 2 users ordered by email ascending:
  ```json
  POST /call
  { "path": "db/users/select", "params": { "orderBy": { "email": "asc" }, "limit": 2, "offset": 0 } }
  ```
  Response: `{ "data": [{ "id": "01H...", "email": "a@b.com" }, { "id": "01H...", "email": "b@b.com" }] }`

- Select the next page (skip the first 2):
  ```json
  POST /call
  { "path": "db/users/select", "params": { "orderBy": { "email": "asc" }, "limit": 2, "offset": 2 } }
  ```

## Acceptance Criteria
- [ ] Select with `limit: 2` returns HTTP 200 and the response body contains at most 2 rows.
- [ ] Select with `offset: N` skips the first N rows of the ordered result set.
- [ ] Two consecutive select calls with identical `orderBy`, `limit`, and `offset` against an unchanged dataset return the same row sequence.
- [ ] Select with `orderBy` on a valid column in `"asc"` direction returns rows in ascending order for that column.
- [ ] Select with `orderBy` on a valid column in `"desc"` direction returns rows in descending order for that column.
- [ ] Select with an unknown column name in `orderBy` returns HTTP 400.
- [ ] Select with an invalid sort direction value (anything other than `"asc"` or `"desc"`) returns HTTP 400.
- [ ] Select with a negative `limit` value returns HTTP 400.
- [ ] Select with a negative `offset` value returns HTTP 400.

## Failure Modes
- Unknown column name in `orderBy`: HTTP 400, request rejected.
- Invalid sort direction (not `"asc"` or `"desc"`): HTTP 400, request rejected.
- Negative `limit` or `offset` value: HTTP 400, request rejected before SQL execution.
