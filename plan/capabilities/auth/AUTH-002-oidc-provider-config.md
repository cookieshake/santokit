---
id: AUTH-002
domain: auth
title: Configure external OIDC provider in Hub
status: planned
depends: [OPERATOR-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_login_external_oidc
code_refs:
  - packages/services/hub/
---

## Intent
Operators need to register external OIDC provider metadata in Hub so that end users can authenticate via a third-party identity provider without changing the Bridge token contract.

## Execution Semantics
- `POST /api/oidc/providers` accepts a provider registration payload with the following required fields:
  - `issuer`: The OIDC issuer URL (must be a well-formed HTTPS URL; used for discovery and token validation).
  - `auth_url`: The provider's authorization endpoint URL.
  - `token_url`: The provider's token endpoint URL.
  - `client_id`: The OAuth2 client ID registered with the provider.
  - `redirect_uris`: An explicit allowlist of permitted redirect URIs. Only URIs in this list are accepted during the OIDC callback; any callback with a URI not in this list is rejected immediately.
- Hub stores provider metadata scoped to the operator context. The `redirect_uris` allowlist is enforced on every OIDC start and exchange request; there is no fallback or wildcard matching.
- Subsequent OIDC start and callback flows use the stored metadata to validate the issuer and redirect paths. Bridge does not interact with the upstream OIDC token directly; Hub translates a successful OIDC authentication into a Santokit PASETO access token, which is the only credential Bridge accepts.

## Observable Outcome
- Provider registration endpoint accepts a valid payload and persists the configuration, returning HTTP 200 or 201 with the registered provider's ID or name in the response body.
- Misconfigured providers (malformed issuer, disallowed redirect URI) are rejected at registration time with a structured error, not at first use.
- Duplicate provider names in the same scope are rejected without overwriting the existing registration.

## Usage

Register a Google OIDC provider, then initiate a login flow:

```http
# Register the provider
POST /api/oidc/providers
Content-Type: application/json

{
  "issuer": "https://accounts.google.com",
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
  "token_url": "https://oauth2.googleapis.com/token",
  "client_id": "123456789-abc.apps.googleusercontent.com",
  "redirect_uris": ["https://app.example.com/auth/callback"]
}

# Response (success)
HTTP/1.1 201 Created
{ "id": "google", "name": "google" }

# Response (duplicate name)
HTTP/1.1 409 Conflict
{ "error": { "code": "CONFLICT", "message": "Provider 'google' already registered", "requestId": "..." } }

# Response (malformed issuer)
HTTP/1.1 400 Bad Request
{ "error": { "code": "BAD_REQUEST", "message": "issuer must be a valid HTTPS URL", "requestId": "..." } }
```

## Acceptance Criteria
- [ ] `POST /api/oidc/providers` with a valid provider payload returns HTTP 200 or 201 and a response body containing the registered provider's ID or name.
- [ ] After registration, initiating an OIDC login flow for that provider does not return a configuration error.
- [ ] `POST /api/oidc/providers` with a malformed `issuer` URL returns HTTP 400.
- [ ] `POST /api/oidc/providers` with a `redirect_uri` not in the allowlist during a subsequent OIDC flow returns HTTP 400.
- [ ] Registering a provider with a duplicate name in the same scope returns HTTP 409.

## Failure Modes
- Invalid or malformed `issuer` URL (not HTTPS, not a valid URL): registration returns HTTP 400. Response body: `{ "error": { "code": "BAD_REQUEST", "message": "...", "requestId": "..." } }`.
- `redirect_uri` presented during OIDC callback does not match any entry in the stored `redirect_uris` allowlist: request returns HTTP 400.
- Duplicate provider name in the same operator scope: registration returns HTTP 409. Response body uses `CONFLICT` code.
