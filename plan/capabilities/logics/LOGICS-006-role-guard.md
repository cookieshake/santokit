---
id: LOGICS-006
domain: logics
title: Enforce role guard on logic execution
status: implemented
depends: [LOGICS-001, OPERATOR-002]
spec_refs: ["plan/spec/logics.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_admin_only
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Privileged logic routes must be restricted to callers holding the required role claim, so bridge evaluates logic auth metadata and rejects unauthorized callers before any SQL executes.

## Execution Semantics
Bridge reads the `auth` field from the logic metadata. When it contains a `roles` list, bridge checks the resolved caller's role claims against that list before executing any SQL. There are three distinct outcomes based on credential state and role:

1. No credential present: bridge returns HTTP 401 without examining any role.
2. Credential present but resolved role is not in the required list: bridge returns HTTP 403.
3. Credential present and role matches: bridge proceeds to SQL execution and returns the result.

The `admin_only` logic is declared in the release snapshot as:

```yaml
name: admin_only
sql: "SELECT id, email FROM users"
auth:
  roles: [admin]
params: {}
```

SQL execution does not begin until the credential is resolved and the role check passes.

## Observable Outcome
- An unauthenticated request is denied with HTTP 401.
- An authenticated end-user without the `admin` role is denied with HTTP 403.
- An authenticated caller holding the `admin` role receives HTTP 200 with the query result rows.

The distinction between 401 and 403 is meaningful: 401 means no identity was established; 403 means identity was established but access was denied.

## Usage
Logic definition (release snapshot):

```yaml
name: admin_only
sql: "SELECT id, email FROM users"
auth:
  roles: [admin]
params: {}
```

Call with no credential (returns 401):

```http
POST /call
Content-Type: application/json

{
  "path": "logics/admin_only"
}
```

Call with end-user credential that does not carry the `admin` role (returns 403):

```http
POST /call
Content-Type: application/json
Authorization: Bearer <end-user-token>

{
  "path": "logics/admin_only"
}
```

Call with admin credential via `X-Santokit-Api-Key` bound to the `admin` role (returns 200):

```http
POST /call
Content-Type: application/json
X-Santokit-Api-Key: <admin-api-key>

{
  "path": "logics/admin_only"
}
```

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/admin_only"}` and no credential returns HTTP 401.
- [ ] `POST /call` with `{"path": "logics/admin_only"}` using an end-user credential without the `admin` role returns HTTP 403.
- [ ] `POST /call` with `{"path": "logics/admin_only"}` using an admin credential returns HTTP 200 with the expected data response.

## Failure Modes
- No credential supplied: HTTP 401.
- Credential present but role insufficient: HTTP 403.
- Role claim missing or stale in credential: HTTP 403.
