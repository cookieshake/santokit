---
id: LOGICS-003
domain: logics
title: Return affected count for execute-only SQL logic
status: implemented
depends: [LOGICS-001, CRUD-001]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_insert_item
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Callers running write-only custom SQL need an explicit success signal; bridge detects non-row-returning results and normalizes them to `{ affected: N }` so mutation outcomes are always observable.

## Execution Semantics
Bridge detects whether the executed SQL returned rows. For INSERT, UPDATE, and DELETE statements the database driver reports the number of affected rows rather than a result set. Bridge wraps this count in the standard execute-only response shape.

The `insert_item` logic is declared in the release snapshot as:

```yaml
name: insert_item
sql: "INSERT INTO items (name, owner_id) VALUES (:name, :owner_id)"
auth: authenticated
params:
  name:
    type: string
    required: true
  owner_id:
    type: string
    required: true
```

After a successful INSERT bridge returns the affected count rather than a row array:

```json
{ "data": { "affected": 1 } }
```

Follow-up CRUD or logic calls can verify the persisted side effects by reading back the inserted row.

## Observable Outcome
- Successful mutation returns `{"data": {"affected": 1}}` when one row was inserted.
- The response shape differs from row-returning logic: `data` is an object with an `affected` field, not an array.
- No `data` array is present in the response.

## Usage
Logic definition (release snapshot):

```yaml
name: insert_item
sql: "INSERT INTO items (name, owner_id) VALUES (:name, :owner_id)"
auth: authenticated
params:
  name:
    type: string
    required: true
  owner_id:
    type: string
    required: true
```

Bridge call:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/insert_item",
  "params": { "name": "widget", "owner_id": "user-42" }
}
```

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/insert_item", "params": {"name": "widget", "owner_id": "user-42"}}` returns HTTP 200 with body `{"data": {"affected": 1}}`.
- [ ] A subsequent read query confirms the inserted row exists in the database with the provided `name` and `owner_id`.
- [ ] The response contains no `data` array; only `{"data": {"affected": N}}` is present.

## Failure Modes
- SQL execution error (constraint violation, type mismatch at DB level): HTTP 400 or 500 depending on error class with structured error body.
- Missing required param before execution: HTTP 400.
- No credential for authenticated logic: HTTP 401.
