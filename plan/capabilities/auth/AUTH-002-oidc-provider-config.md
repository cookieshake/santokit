---
id: AUTH-002
domain: auth
title: Configure external OIDC provider in Hub
status: implemented
depends: [OPERATOR-001]
spec_refs: ["plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_external_oidc
code_refs:
  - packages/services/hub/
---

## Intent
Operators need to register external OIDC provider metadata in Hub so that end users can authenticate via a third-party identity provider without changing the Bridge token contract.

## Execution Semantics
- Hub stores provider metadata and allowlist constraints per project/env.
- Subsequent OIDC start/callback uses this config to validate issuer and redirect paths.
- Bridge still only accepts Santokit access token, not raw upstream OIDC token.

## Observable Outcome
- Provider registration endpoint accepts valid metadata and persists configuration.
- Misconfigured providers fail early during setup or callback validation.

## Usage
- `POST /api/oidc/providers` with provider metadata (`issuer`, `auth_url`, `token_url`, `client_id`, `redirect_uris`)

## Acceptance Criteria
- [ ] `POST /api/oidc/providers` with a valid provider payload returns HTTP 200 or 201 and a response body containing the registered provider's ID or name.
- [ ] After registration, initiating an OIDC login flow for that provider does not return a configuration error.
- [ ] `POST /api/oidc/providers` with a malformed `issuer` URL returns HTTP 400.
- [ ] `POST /api/oidc/providers` with a `redirect_uri` not in the allowlist returns HTTP 400.
- [ ] Registering a provider with a duplicate name in the same scope returns HTTP 409.

## Failure Modes
- Invalid redirect URI allowlist or malformed issuer URLs: registration rejected.
- Duplicate or conflicting provider name in same scope: write is rejected.
