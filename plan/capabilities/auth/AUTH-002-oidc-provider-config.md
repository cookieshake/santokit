---
id: AUTH-002
domain: auth
title: Configure external OIDC provider in Hub
status: implemented
owners: [hub]
flow_refs: ["plan/capabilities/auth/README.md"]
spec_refs: ["plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_external_oidc
code_refs:
  - packages/services/hub/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_enduser_login_external_oidc"]
---

## Intent
Register provider metadata required for OIDC login flows.

## API Usage
- `POST /api/oidc/providers` with provider metadata (`issuer`, `auth_url`, `token_url`, `client_id`, `redirect_uris`)

## Acceptance
- OIDC provider registration endpoint accepts valid provider configuration.
