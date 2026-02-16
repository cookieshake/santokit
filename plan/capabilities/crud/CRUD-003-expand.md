---
id: CRUD-003
domain: crud
title: Expand related rows via declared foreign key relation
status: planned
depends: [CRUD-001]
spec_refs: ["plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_expand
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Allows callers to fetch parent rows and their FK-related rows in a single request by declaring `expand` entries, reducing round trips for relational data access.

## Execution Semantics
- Each entry in the `expand` array is validated against the declared relation metadata in `schema.yaml`. The name must match the `references.as` value on the foreign key column of the table being selected. For example, if `posts.user_id` declares `references: { table: users, as: user }`, then `"expand": ["user"]` is the valid key. Any name not matching a declared `references.as` value is rejected with HTTP 400.
- Bridge executes a relation-aware query strategy (typically a JOIN or secondary lookup) and embeds the related object directly in each result row under the relation name key.
- The expanded related object is subject to the caller's column permissions on the related table. Columns on the related table that the caller is not permitted to see are omitted from the nested object. The select still succeeds; only the column set of the nested object is narrowed.
- If the caller lacks any read permission on the related table itself, the request is denied with HTTP 403.

## Observable Outcome
- Select with `"expand": ["user"]` returns HTTP 200 with each result row containing the related object nested under `"user"`:
  ```json
  {
    "data": [
      {
        "id": "01HPOST123",
        "title": "Hello world",
        "user_id": "01H8XYZABC123",
        "user": {
          "id": "01H8XYZABC123",
          "email": "a@b.com"
        }
      }
    ]
  }
  ```
- Select without `expand` returns HTTP 200 with base row fields only; no relation key is present in the response.
- An expand for an undeclared relation name returns HTTP 400 before any DB query is executed.

## Usage
- Select posts and expand the related user in a single request:
  ```json
  POST /call
  { "path": "db/posts/select", "params": { "expand": ["user"], "where": { "id": "01HPOST123" } } }
  ```
  Response:
  ```json
  { "data": [{ "id": "01HPOST123", "title": "Hello world", "user_id": "01H8XYZABC123", "user": { "id": "01H8XYZABC123", "email": "a@b.com" } }] }
  ```

- Select posts without expand (base fields only):
  ```json
  POST /call
  { "path": "db/posts/select", "params": { "where": { "id": "01HPOST123" } } }
  ```
  Response: `{ "data": [{ "id": "01HPOST123", "title": "Hello world", "user_id": "01H8XYZABC123" }] }`

## Acceptance Criteria
- [ ] Select with a valid `expand` entry returns HTTP 200 and each result row contains the related object nested under the declared relation name (the `references.as` value from schema).
- [ ] Select without `expand` returns HTTP 200 with base row fields only; no relation key appears in the response.
- [ ] Select with an `expand` entry for a name not matching any `references.as` declaration in the schema returns HTTP 400.
- [ ] Expanded related rows are filtered to the columns permitted by the caller's permission context on the related table; the select succeeds but the nested object contains only allowed columns.
- [ ] When the caller's permission context denies all access to the related table, the request returns HTTP 403.
- [ ] Request with no credential returns HTTP 401.
- [ ] Request targeting a table that does not exist returns HTTP 404.

## Failure Modes
- Unknown relation name in `expand` (no matching `references.as` in schema): HTTP 400, request rejected before DB query.
- Caller lacks any read permission on the related table: HTTP 403.
- No credential on request: HTTP 401.
- Table or path does not exist: HTTP 404.
