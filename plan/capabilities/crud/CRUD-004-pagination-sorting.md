---
id: CRUD-004
domain: crud
title: Pagination and sorting on select operations
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/crud.md", "plan/spec/conventions.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_pagination_sorting
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Enables callers to traverse large result sets predictably by applying stable ordering and bounded page windows to select operations.

## Execution Semantics
- Bridge validates `orderBy` keys/directions against schema identifiers.
- `limit` and `offset` are translated to bounded SQL pagination clauses.
- Combined sorting + paging produces deterministic slice when sort key is valid.

## Observable Outcome
- Returned row count respects `limit`.
- Repeated calls with same params return stable order for unchanged dataset.

## Usage
- `POST /call` with `{"path":"db/users/select","params":{"orderBy":{"email":"asc"},"limit":2,"offset":0}}`

## Acceptance Criteria
- [ ] Select with `limit: 2` returns HTTP 200 and the response body contains at most 2 rows.
- [ ] Select with `offset: N` skips the first N rows of the ordered result set.
- [ ] Two consecutive select calls with identical `orderBy`, `limit`, and `offset` against an unchanged dataset return the same row sequence.
- [ ] Select with `orderBy` on a valid column in `"asc"` direction returns rows in ascending order for that column.
- [ ] Select with `orderBy` on a valid column in `"desc"` direction returns rows in descending order for that column.
- [ ] Select with an unknown column in `orderBy` returns HTTP 400.
- [ ] Select with an invalid sort direction value returns HTTP 400.
- [ ] Select with an out-of-range `limit` or `offset` value returns HTTP 400.

## Failure Modes
- Invalid sort direction or unknown column: request rejected.
- Out-of-range pagination values: request rejected by validation policy.
