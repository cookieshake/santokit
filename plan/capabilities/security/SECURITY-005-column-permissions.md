---
id: SECURITY-005
domain: security
title: Enforce explicit column-level permissions
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_permissions
code_refs:
  - packages/services/bridge/
---

## Intent

Restrict selectable and writable columns using `permissions.yaml` column lists. Enforce least-privilege field access per role for both read and write operations. Different roles operating on the same table observe different column subsets on select and are permitted to write different column subsets on insert and update.

## Execution Semantics

- Authorization computes the allowed column set for the matched rule from its `columns` field.
- On select, Bridge projects the result set to allowed columns before response serialization; any column outside the allowed set is omitted from the response.
- On insert and update, Bridge validates the incoming payload against the allowed column set before constructing the SQL statement. Any column in the payload that is not in the allowed set causes the entire request to be rejected with `400 BAD_REQUEST` before any write occurs.
- Violations are rejected before SQL write or response emission; no partial write is applied.

## Observable Outcome

- Basic role receives only the columns listed in its rule on select and cannot include any other column in insert or update payloads.
- Admin role can read and write the broader column set defined by its own rule.

## Usage

`permissions.yaml` — different column sets per role for read and write:

```yaml
tables:
  users:
    select:
      - roles: [basic]
        columns: ["id", "name"]
      - roles: [admin]
        columns: ["id", "name", "email", "status", "internal_notes"]
    insert:
      - roles: [basic]
        columns: ["name"]
      - roles: [admin]
        columns: ["name", "email", "status", "internal_notes"]
    update:
      - roles: [basic]
        columns: ["name"]
      - roles: [admin]
        columns: ["name", "email", "status", "internal_notes"]
```

`POST /call` as basic role — select (only `id` and `name` returned):

```http
POST /call
Authorization: Bearer <jwt-for-basic-user>
Content-Type: application/json

{
  "path": "db/users/select",
  "params": {}
}
```

Response:

```json
{
  "rows": [
    { "id": "user-1", "name": "Alice" }
  ]
}
```

`POST /call` as basic role — insert with disallowed column `email` (rejected):

```http
POST /call
Authorization: Bearer <jwt-for-basic-user>
Content-Type: application/json

{
  "path": "db/users/insert",
  "params": {
    "data": { "name": "Bob", "email": "bob@example.com" }
  }
}
```

Response:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "column 'email' is not permitted for this role",
    "requestId": "req-xyz789"
  }
}
```

## Acceptance Criteria

- [ ] Basic role receives only the columns listed in its `permissions.yaml` rule on select; unlisted columns are absent from the response.
- [ ] Admin role receives the broader set of columns listed in its rule on select.
- [ ] Basic role insert payload containing a disallowed column returns `400 BAD_REQUEST` before any row is written.
- [ ] Basic role update payload containing a disallowed column returns `400 BAD_REQUEST` before any row is modified.
- [ ] Admin role can successfully insert and update using columns from its broader allowed set.

## Failure Modes

- **Disallowed column in insert payload** — Payload includes a column not in the role's allowed `columns` list for insert: Bridge returns `400 BAD_REQUEST` with an error message identifying the disallowed column. No row is inserted.
- **Disallowed column in update payload** — Payload includes a column not in the role's allowed `columns` list for update: Bridge returns `400 BAD_REQUEST` with an error message identifying the disallowed column. No row is modified.
- **Policy references non-existent column** — A `columns` entry names a column that does not exist in the table schema: rule evaluation fails with `400 BAD_REQUEST`.
- **Role not matched** — Caller's token holds no role matching any rule for the requested operation: Bridge returns `403 FORBIDDEN`.
