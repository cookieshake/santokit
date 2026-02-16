---
id: LOGICS-004
domain: logics
title: Validate required logic parameters and bind safely
status: planned
depends: [LOGICS-001]
spec_refs: ["plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_get_items
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Callers invoking parameterized logic need guaranteed presence and type safety of required inputs before any SQL executes, so bridge validates and binds params before query execution.

## Execution Semantics
Bridge reads the param declarations from the logic metadata. For each declared param with `required: true`, bridge checks that the caller supplied a value. If any required param is absent or carries the wrong type, bridge rejects the request before the SQL is sent to the database.

The `get_items` logic is declared in the release snapshot as:

```yaml
name: get_items
sql: "SELECT * FROM items WHERE owner_id = :owner_id"
auth: authenticated
params:
  owner_id:
    type: string
    required: true
```

When validation passes, bridge binds `:owner_id` to the caller-supplied value and executes the query. The result rows are returned in the standard row-returning envelope.

## Observable Outcome
- Calls with a valid `owner_id` return only rows where `owner_id` matches; rows belonging to other owners are not included.
- A valid call for a user with no rows returns HTTP 200 with an empty `data` array.
- A call with a missing or mistyped required param is rejected before any DB round-trip.

## Usage
Logic definition (release snapshot):

```yaml
name: get_items
sql: "SELECT * FROM items WHERE owner_id = :owner_id"
auth: authenticated
params:
  owner_id:
    type: string
    required: true
```

Bridge call with required param supplied:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/get_items",
  "params": { "owner_id": "owner-1" }
}
```

Bridge call missing required param (will be rejected):

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/get_items"
}
```

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/get_items", "params": {"owner_id": "owner-1"}}` returns HTTP 200 with rows belonging to `owner-1`.
- [ ] The same call with `{"owner_id": "nonexistent-user"}` returns HTTP 200 with an empty `data` array.
- [ ] `POST /call` with `{"path": "logics/get_items"}` (missing `owner_id`) returns HTTP 400.
- [ ] `POST /call` with `{"path": "logics/get_items", "params": {"owner_id": 123}}` (wrong type: integer instead of string) returns HTTP 400.

## Failure Modes
- Required param omitted: HTTP 400 with structured error body.
- Param type mismatch: HTTP 400 with structured error body.
- No credential for authenticated logic: HTTP 401.
