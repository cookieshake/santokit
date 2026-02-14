---
id: AUTH-004
domain: auth
title: Explicit OIDC account linking for authenticated user
status: planned
owners: [hub]
flow_refs: ["plan/capabilities/auth/README.md"]
spec_refs: ["plan/spec/auth.md"]
test_refs: []
code_refs:
  - packages/services/hub/
verify: []
---

## Intent
Allow explicit identity attachment without automatic merge behavior.

## Caller Intent
- Attach an additional OIDC identity to the currently authenticated end-user account intentionally.

## Execution Semantics
- Link start requires active session and enters `mode=link` flow.
- Exchange step maps provider subject to current end-user identity if unclaimed.
- Automatic email-based merge is disallowed; ownership must be explicit.

## Observable Outcome
- On success, future login with linked provider resolves to the same end-user account.
- Existing claim by another user returns conflict.

## API Usage
- `GET /oidc/:provider/start?mode=link&project=<project>&env=<env>&redirect_uri=<uri>`
- `POST /oidc/:provider/exchange` with `{ exchange_code }` and active session

## Acceptance
- Link flow requires active user session and returns conflict when identity is already linked elsewhere.

## Failure Modes
- Missing session during link exchange: request is rejected.
- Provider subject already linked to another user: `409 CONFLICT`.
