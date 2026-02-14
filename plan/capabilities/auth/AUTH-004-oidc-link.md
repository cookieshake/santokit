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
- Link start requires active session and enters `mode=link` flow.
- Exchange step maps provider subject to current end-user identity if unclaimed.
- Automatic email-based merge is disallowed; ownership must be explicit.

## Observable Outcome
- On success, future login with linked provider resolves to the same end-user account.
- Existing claim by another user returns conflict.

## Usage
- `GET /oidc/:provider/start?mode=link&project=<project>&env=<env>&redirect_uri=<uri>`
- `POST /oidc/:provider/exchange` with `{ exchange_code }` and active session

## Acceptance Criteria
- [ ] `GET /oidc/:provider/start?mode=link` without an active session returns HTTP 401.
- [ ] A complete link flow with an active session and an unclaimed provider subject returns HTTP 200 and the provider identity is associated with the current account.
- [ ] After successful linking, initiating a normal login with the linked provider resolves to the same end-user account (same user ID in response).
- [ ] Attempting to link a provider subject already claimed by a different user returns HTTP 409.
- [ ] `POST /oidc/:provider/exchange` without a valid `exchange_code` returns HTTP 400.

## Failure Modes
- Missing session during link exchange: request is rejected.
- Provider subject already linked to another user: `409 CONFLICT`.
