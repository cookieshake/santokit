---
id: AUTH-001
domain: auth
title: End-user login with Hub-issued access token
status: implemented
owners: [hub, bridge]
flow_refs: ["plan/capabilities/auth/README.md"]
spec_refs: ["plan/spec/auth.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_hub_issuer
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_enduser_login_hub_issuer"]
---

## Intent
Issue and consume Santokit end-user tokens through Hub and Bridge boundaries.

## API Usage
- `POST /api/endusers/signup` with `{ project, env, email, password }`
- `POST /api/endusers/login` with `{ project, env, email, password }`
- `POST /call` with `Authorization: Bearer <access_token>`

## Acceptance
- Signup/login succeeds and issued token is accepted by Bridge auth pipeline.
