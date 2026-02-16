---
id: LOGICS-002
domain: logics
title: Execute public logic and return greeting
status: implemented
depends: [LOGICS-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_002_public_hello.py::test_logics_public_hello
code_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_002_public_hello.py
---

## Intent
API consumers need to invoke utility logic routes without any credential, so logic routes declared as public auth must be callable without role-specific grants.

## Execution Semantics
Bridge checks the logic metadata for the `auth` field. When `auth: public` is set, no credential resolution is performed. Bridge proceeds directly to SQL execution and wraps the result rows in the standard response envelope.

The `public_hello` logic is declared in the release snapshot as:

```yaml
name: public_hello
sql: "SELECT 'hello' AS greeting"
auth: public
params: {}
```

Because the SQL contains no parameter bindings and no auth injection, the same query executes identically for every caller regardless of credential state.

## Observable Outcome
The response follows the row-returning shape. The `data` array contains exactly one row with the projected column:

```json
{
  "data": [
    { "greeting": "hello" }
  ]
}
```

The response is deterministic: the same value is returned on every call, with or without a credential.

## Usage
Logic definition (release snapshot):

```yaml
name: public_hello
sql: "SELECT 'hello' AS greeting"
auth: public
params: {}
```

Bridge call (no credential required):

```http
POST /call
Content-Type: application/json

{
  "path": "logics/public_hello"
}
```

The same call with an `Authorization` header is also accepted and produces an identical response body.

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/public_hello"}` and no credential returns HTTP 200 with body `{"data": [{"greeting": "hello"}]}`.
- [ ] The same call with a valid credential present produces the identical response body with HTTP 200.
- [ ] `POST /call` with `{"path": "logics/nonexistent"}` returns HTTP 404.

## Failure Modes
- Logic name does not exist in the release snapshot: HTTP 404.
