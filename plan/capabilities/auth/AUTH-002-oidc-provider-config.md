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

## Caller Intent
- Enable external identity provider login for a target project/env without changing Bridge token contract.

## Execution Semantics
- Hub stores provider metadata and allowlist constraints per project/env.
- Subsequent OIDC start/callback uses this config to validate issuer and redirect paths.
- Bridge still only accepts Santokit access token, not raw upstream OIDC token.

## Observable Outcome
- Provider registration endpoint accepts valid metadata and persists configuration.
- Misconfigured providers fail early during setup or callback validation.

## API Usage
- `POST /api/oidc/providers` with provider metadata (`issuer`, `auth_url`, `token_url`, `client_id`, `redirect_uris`)

## Acceptance
- OIDC provider registration endpoint accepts valid provider configuration.

## Failure Modes
- Invalid redirect URI allowlist or malformed issuer URLs: registration rejected.
- Duplicate or conflicting provider name in same scope: write is rejected.
