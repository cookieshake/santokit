---
id: AUTH-003
domain: auth
title: Isolate end-user auth across multiple projects
status: implemented
depends: [AUTH-001]
spec_refs: ["plan/spec/bridge-hub-protocol.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_multi_project_login
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
---

## Intent
End users operating across multiple project/env contexts need independent sessions on a single Hub domain without credential crossover or privilege leak between projects.

## Execution Semantics
- Hub issues context-bound PASETO tokens with `projectId` and `envId` claims embedded. Tokens are non-transferable across project/env boundaries.
- When cookies are used, each session is stored under a namespaced key: `stk_access_<project>_<env>`. This prevents cookies from one project/env from being read as credentials for another, even within the same browser or client session.
- Bridge resolves exactly one effective credential per request using the following priority order:
  1. `X-Santokit-Api-Key` header — if present, the key's own project/env is the final context; routing hints are ignored.
  2. `Authorization: Bearer <token>` header — used if no API key is present.
  3. `stk_access_<project>_<env>` cookie — used only if neither header credential is present.
- When using bearer tokens or cookies, the caller must supply the routing context via `X-Santokit-Project` and `X-Santokit-Env` hint headers so Bridge can select the correct cookie namespace and validate the binding. If hints are ambiguous or absent and multiple cookies are present, the request cannot be resolved safely.
- After selecting the credential, Bridge validates that the token's `projectId`/`envId` claims match the resolved context. A mismatch is rejected immediately with HTTP 403 regardless of role or permission configuration.

## Observable Outcome
- The same end-user identity can hold independent, concurrently valid sessions for different project/env pairs.
- Tokens and cookies from one project/env cannot be used to authorize requests in another project/env, even when hint headers are manipulated.
- Both sessions remain valid simultaneously; logging into a second project does not invalidate the first.

## Usage

Log in to two separate projects and use each token only against its own context:

```http
# 1. Log in to project A
POST /api/endusers/login
Content-Type: application/json

{ "project": "acme", "env": "prod", "email": "alice@example.com", "password": "s3cr3t" }

# Response
HTTP/1.1 200 OK
{ "access_token": "v4.local.TokenA..." }

# 2. Log in to project B
POST /api/endusers/login
Content-Type: application/json

{ "project": "beta", "env": "staging", "email": "alice@example.com", "password": "s3cr3t" }

# Response
HTTP/1.1 200 OK
{ "access_token": "v4.local.TokenB..." }

# 3. Call Bridge for project A — succeeds
POST /call
Authorization: Bearer v4.local.TokenA...
X-Santokit-Project: acme
X-Santokit-Env: prod
Content-Type: application/json

{ "resource": "posts", "action": "list" }
# → HTTP 200

# 4. Call Bridge for project B with project A token — rejected
POST /call
Authorization: Bearer v4.local.TokenA...
X-Santokit-Project: beta
X-Santokit-Env: staging
Content-Type: application/json

{ "resource": "posts", "action": "list" }
# → HTTP 403
# { "error": { "code": "FORBIDDEN", "message": "token project binding mismatch", "requestId": "..." } }
```

## Acceptance Criteria
- [ ] A user can log in to project A and project B separately, receiving distinct `access_token` values for each (different `projectId`/`envId` bindings).
- [ ] `POST /call` with the project A token and project A context headers (`X-Santokit-Project`, `X-Santokit-Env`) returns HTTP 200.
- [ ] `POST /call` with the project A token but project B context headers returns HTTP 403.
- [ ] `POST /call` with the project B token but project A context headers returns HTTP 403.
- [ ] Both sessions remain independently valid concurrently without invalidating each other.

## Failure Modes
- Missing `X-Santokit-Project`/`X-Santokit-Env` hint headers when multiple `stk_access_<project>_<env>` cookies are present: request cannot be resolved to a single context and returns HTTP 401.
- Token `projectId`/`envId` does not match the resolved hint context: Bridge returns HTTP 403. Response body: `{ "error": { "code": "FORBIDDEN", "message": "...", "requestId": "..." } }`.
- No credential present in any of the three priority slots: Bridge returns HTTP 401.
