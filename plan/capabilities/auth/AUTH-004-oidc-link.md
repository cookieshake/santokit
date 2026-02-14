---
id: AUTH-004
domain: auth
title: Explicit OIDC account linking for authenticated user
status: planned
depends: [AUTH-002]
spec_refs: ["plan/spec/auth.md"]
test_refs: []
code_refs: []
---

## Intent
Authenticated end users need a way to explicitly attach an additional OIDC identity to their existing account so that future logins via that provider resolve to the same account, without any automatic email-based merge behavior.

## Execution Semantics
- Link start requires an active Santokit session. `GET /oidc/:provider/start?mode=link&project=<p>&env=<e>&redirect_uri=<uri>` initiates the flow by redirecting the user to the external provider's authorization URL. The `mode=link` parameter signals Hub to associate the resulting OIDC identity with the currently authenticated user rather than creating a new account.
- The provider redirects back to Hub after the user authenticates. Hub validates the callback, generates a short-lived `exchange_code`, and redirects the client to the supplied `redirect_uri` with the code attached.
- The client presents the `exchange_code` to `POST /oidc/:provider/exchange` with `{ exchange_code }` while holding the active session. Hub verifies the code, checks that the provider subject is unclaimed, and creates the association. Automatic email-based merging is disallowed; if the provider subject email matches an existing user, the link is still only permitted through this explicit flow with an active session.
- If the provider subject is already claimed by a different end-user account, the link is rejected with HTTP 409.

## Observable Outcome
- On successful exchange, the OIDC provider identity is permanently associated with the authenticated end-user account. Subsequent logins via that provider resolve to the same account without requiring re-linking.
- An attempt to link a provider subject already claimed by another user returns a conflict error and leaves both accounts unchanged.

## Usage

Full start-to-exchange flow for linking a Google account to an existing session:

```http
# Step 1: Initiate link flow (user must have an active session cookie)
GET /oidc/google/start?mode=link&project=acme&env=prod&redirect_uri=https%3A%2F%2Fapp.example.com%2Fauth%2Fcallback
Cookie: stk_access_acme_prod=<session-token>

# Hub redirects to Google:
# → 302 https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&state=...

# Step 2: Google redirects back to Hub callback (handled internally by Hub)
# Hub validates callback, generates exchange_code, redirects client:
# → 302 https://app.example.com/auth/callback?exchange_code=ekc_abc123

# Step 3: Client exchanges the code
POST /oidc/google/exchange
Content-Type: application/json
Cookie: stk_access_acme_prod=<session-token>

{ "exchange_code": "ekc_abc123" }

# Response (success — subject was unclaimed)
HTTP/1.1 200 OK
{ "linked": true, "provider": "google" }

# Response (subject already claimed by another user)
HTTP/1.1 409 Conflict
{ "error": { "code": "CONFLICT", "message": "provider subject already linked to another account", "requestId": "..." } }

# Response (no active session)
HTTP/1.1 401 Unauthorized
{ "error": { "code": "UNAUTHORIZED", "message": "active session required for account linking", "requestId": "..." } }

# Response (invalid or expired exchange_code)
HTTP/1.1 400 Bad Request
{ "error": { "code": "BAD_REQUEST", "message": "invalid or expired exchange_code", "requestId": "..." } }
```

## Acceptance Criteria
- [ ] `GET /oidc/:provider/start?mode=link` without an active session returns HTTP 401.
- [ ] A complete link flow with an active session and an unclaimed provider subject returns HTTP 200 and the provider identity is associated with the current account.
- [ ] After successful linking, initiating a normal login with the linked provider resolves to the same end-user account (same user ID in response).
- [ ] Attempting to link a provider subject already claimed by a different user returns HTTP 409.
- [ ] `POST /oidc/:provider/exchange` without a valid `exchange_code` returns HTTP 400.

## Failure Modes
- Link start attempted without an active session: Hub returns HTTP 401. Response body: `{ "error": { "code": "UNAUTHORIZED", "message": "...", "requestId": "..." } }`.
- `exchange_code` is invalid, malformed, or expired: Hub returns HTTP 400.
- Provider subject is already linked to a different end-user account: Hub returns HTTP 409. Neither account is modified.
- `redirect_uri` supplied to `/start` is not in the provider's registered `redirect_uris` allowlist: Hub returns HTTP 400 before redirecting to the external provider.
