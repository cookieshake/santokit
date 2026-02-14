---
id: AUTH-001
domain: auth
title: End-user login with Hub-issued access token
status: implemented
depends: [OPERATOR-001, OPERATOR-004]
spec_refs: ["plan/spec/auth.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_hub_issuer
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
---

## Intent
End users need to authenticate against a specific `project/env` and obtain an access token that Bridge can verify offline. Hub issues and validates the token; Bridge enforces context binding before authorizing requests.

## Execution Semantics
- Hub creates/validates end-user identity and issues access token bound to `project/env`.
- Bridge resolves credential context and validates token binding before request authorization.
- Authorization decision for `/call` is then evaluated against release permissions.

## Observable Outcome
- Login endpoint returns usable access token.
- Same token is accepted by Bridge for the matching context and rejected on mismatch.

## Usage
- `POST /api/endusers/signup` with `{ project, env, email, password }`
- `POST /api/endusers/login` with `{ project, env, email, password }`
- `POST /call` with `Authorization: Bearer <access_token>`

## Acceptance Criteria
- [ ] `POST /api/endusers/signup` with valid credentials returns HTTP 200 and a JSON body containing an `access_token` field.
- [ ] `POST /api/endusers/login` with correct credentials returns HTTP 200 and a non-empty `access_token`.
- [ ] The issued token is accepted by Bridge's auth pipeline: `POST /call` with `Authorization: Bearer <access_token>` returns HTTP 200 for the matching `project/env`.
- [ ] The same token presented to Bridge for a different `project/env` returns HTTP 401 or HTTP 403.

## Failure Modes
- Wrong password or unknown user: login fails.
- Token context mismatch (`project/env`): Bridge returns authorization failure.
