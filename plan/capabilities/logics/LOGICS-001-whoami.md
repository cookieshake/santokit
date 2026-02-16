---
id: LOGICS-001
domain: logics
title: Return authenticated subject via system variable
status: planned
depends: [OPERATOR-001, OPERATOR-003, OPERATOR-004]
spec_refs: []
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_whoami
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Authenticated callers need to identify themselves within custom SQL logic without re-parsing credentials; bridge injects `:auth.sub` so logic SQL can reference the caller directly.

## Execution Semantics
Bridge extracts the caller's subject from the resolved credential and binds it to the reserved parameter `:auth.sub` before executing the logic SQL. The caller never passes `:auth.sub` in the request params; it is always injected by bridge.

The `whoami` logic is declared in the release snapshot as:

```yaml
name: whoami
sql: "SELECT id, email FROM users WHERE id = :auth.sub"
auth: authenticated
params: {}
```

When bridge receives the `/call` request it resolves the credential, extracts the subject claim, and substitutes `:auth.sub` into the SQL before the query runs against the database.

## Observable Outcome
The response follows the row-returning shape. The first row in `data` contains the fields projected by the SELECT — in this case `id` and `email` of the authenticated user:

```json
{
  "data": [
    { "id": "user-1", "email": "user1@example.com" }
  ]
}
```

A different authenticated caller invoking the same logic receives their own row, not another caller's row, because `:auth.sub` is resolved per-request from the caller's credential.

## Usage
Logic definition (release snapshot):

```yaml
name: whoami
sql: "SELECT id, email FROM users WHERE id = :auth.sub"
auth: authenticated
params: {}
```

Bridge call:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/whoami"
}
```

No `params` field is needed; `:auth.sub` is injected automatically.

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/whoami"}` and a valid credential returns HTTP 200 with a non-empty `data` array.
- [ ] The response body has the shape `{"data": [{"id": "user-1", "email": "user1@example.com"}]}` matching the authenticated caller's own user record.
- [ ] Two different authenticated callers each receive their own distinct record — caller A's response does not contain caller B's `id` or `email`.
- [ ] `POST /call` with no credential returns HTTP 401.

## Failure Modes
- No credential supplied for authenticated logic: HTTP 401.
- Credential present but subject does not match any user row: HTTP 200 with empty `data` array (SQL returns zero rows, not an error).
