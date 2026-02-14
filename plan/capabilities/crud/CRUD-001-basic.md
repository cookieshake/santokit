---
id: CRUD-001
domain: crud
title: Basic insert/select and generated ID behavior
status: implemented
depends: [OPERATOR-001, OPERATOR-003, OPERATOR-004]
spec_refs: ["plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_basic
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Provides the baseline CRUD contract for insert and select so that callers can insert and retrieve rows without writing SQL while preserving schema and permission constraints.

## Execution Semantics
- Bridge parses the `db/{table}/{op}` path and validates table and column existence against the schema IR before any SQL is executed.
- Insert applies the ID generation policy declared in `schema.yaml` for the table's `id` field. Supported policies are `ulid`, `uuid_v7`, `uuid_v4`, `nanoid` (Bridge generates the value, type is always `string`), `auto_increment` (DB generates, type is always `bigint`), and `client` (caller must supply the value, type defaults to `string` but may be `bigint`).
- For any policy other than `client`, if the caller includes an `id` field in the request payload, Bridge rejects the request with HTTP 400 before reaching the DB. The generated ID is never overridable by the client under auto-generation policies.
- Select path validates the `where` filter shape and resolves column names against schema, then applies the caller's permission context to restrict which columns are returned.

## Observable Outcome
- Successful insert returns HTTP 200 with the inserted row, including the generated primary key and all columns permitted by the caller's permission context:
  ```json
  { "data": [{ "id": "01H8XYZABC123", "email": "a@b.com", "created_at": "2026-02-15T00:00:00Z" }] }
  ```
- Select returns HTTP 200 with rows matching the filter and only the columns allowed by the caller's permission context:
  ```json
  { "data": [{ "id": "01H8XYZABC123", "email": "a@b.com" }] }
  ```

## Usage
- Insert a new user (Bridge generates the `id` via `ulid`):
  ```json
  POST /call
  { "path": "db/users/insert", "params": { "values": { "email": "a@b.com" } } }
  ```
  Response: `{ "data": [{ "id": "01H8XYZABC123", "email": "a@b.com", "created_at": "2026-02-15T00:00:00Z" }] }`

- Select users matching a filter:
  ```json
  POST /call
  { "path": "db/users/select", "params": { "where": { "email": "a@b.com" } } }
  ```
  Response: `{ "data": [{ "id": "01H8XYZABC123", "email": "a@b.com" }] }`

## Acceptance Criteria
- [ ] Insert with a valid payload returns HTTP 200 and the response body is `{"data": [...]}` containing the inserted row with a generated primary key.
- [ ] Inserted row is retrievable via select with a matching `where` filter.
- [ ] Select returns only columns allowed by the caller's permission context; restricted columns are absent from the response object.
- [ ] Manually supplying an `id` value when the table uses an auto-generation policy (`ulid`, `uuid_v7`, `uuid_v4`, `nanoid`, `auto_increment`) returns HTTP 400.
- [ ] Insert or select referencing an unknown column returns HTTP 400.
- [ ] Select with a malformed `where` shape returns HTTP 400.
- [ ] Request with no credential returns HTTP 401.
- [ ] Request with a credential that has no permission for the target table returns HTTP 403.
- [ ] Request targeting a table that does not exist in the schema returns HTTP 404.

## Failure Modes
- Caller-supplied ID under a non-`client` generation policy: HTTP 400, request rejected before DB write.
- Unknown column name in insert values or where filter: HTTP 400, request rejected.
- Malformed or invalid where shape: HTTP 400, request rejected.
- No credential on request: HTTP 401.
- Credential present but role lacks permission for the table: HTTP 403.
- Table or path does not exist: HTTP 404.
