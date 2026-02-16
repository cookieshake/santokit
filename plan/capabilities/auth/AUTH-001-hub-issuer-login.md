---
id: AUTH-001
domain: auth
title: End-user login with Hub-issued access token
status: planned
depends: [OPERATOR-001, OPERATOR-004]
spec_refs: ["plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_hub_issuer
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
---

## Intent
End users need to authenticate against a specific `project/env` and obtain an access token that Bridge can verify offline. Hub issues and validates the token; Bridge enforces context binding before authorizing requests.

## Execution Semantics
- Hub creates or validates end-user identity via `POST /api/endusers/signup` or `POST /api/endusers/login` and issues a PASETO v4.local access token bound to the given `project/env`.
- The token carries claims: `sub` (end-user ID), `roles` (assigned role names), `projectId`, and `envId`. These claims encode the full binding context.
- Bridge fetches the signing key for the relevant `project/env` from Hub via `GET /internal/keys/{project}/{env}` and caches it locally. Token verification is performed offline using this cached key on each request; Hub is not consulted per-request.
- After verifying the token, Bridge checks that the token's `projectId` and `envId` match the resolved request context. A mismatch causes immediate rejection before any permission evaluation occurs.
- Authorization for `/call` is then evaluated against the release permissions using the roles extracted from the verified token claims.

## Observable Outcome
- Login and signup endpoints return HTTP 200 with a JSON body `{ "access_token": "..." }` where the value is a PASETO v4.local token string.
- The returned token is accepted by Bridge for requests targeting the matching `project/env`.
- The same token presented to Bridge for a different `project/env` is rejected with an authorization error before any data access occurs.

## Usage

Signup a new end user, then log in and use the token to call Bridge:

```http
# 1. Sign up
POST /api/endusers/signup
Content-Type: application/json

{ "project": "acme", "env": "prod", "email": "alice@example.com", "password": "s3cr3t" }

# Response
HTTP/1.1 200 OK
{ "access_token": "v4.local.Abc123..." }

# 2. Log in (subsequent sessions)
POST /api/endusers/login
Content-Type: application/json

{ "project": "acme", "env": "prod", "email": "alice@example.com", "password": "s3cr3t" }

# Response
HTTP/1.1 200 OK
{ "access_token": "v4.local.Xyz789..." }

# 3. Call Bridge using the token
POST /call
Authorization: Bearer v4.local.Xyz789...
Content-Type: application/json

{ "resource": "posts", "action": "list" }
```

## Acceptance Criteria
- [ ] `POST /api/endusers/signup` with valid credentials returns HTTP 200 and a JSON body of the form `{ "access_token": "<paseto-token>" }` where the token is a non-empty PASETO v4.local string.
- [ ] `POST /api/endusers/login` with correct credentials returns HTTP 200 and a non-empty `access_token` in the same shape.
- [ ] The issued token is accepted by Bridge's auth pipeline: `POST /call` with `Authorization: Bearer <access_token>` returns HTTP 200 for requests targeting the matching `project/env`.
- [ ] The same token presented to Bridge for a different `project/env` returns HTTP 403 (binding mismatch).

## Failure Modes
- Wrong password or unknown user at login: Hub returns HTTP 401. Response body: `{ "error": { "code": "UNAUTHORIZED", "message": "...", "requestId": "..." } }`.
- Token `projectId`/`envId` does not match the Bridge request context: Bridge returns HTTP 403 before any permission check. Response body follows the same error envelope.
- No credential provided to Bridge: Bridge returns HTTP 401.
