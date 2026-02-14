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

## API Usage
- `GET /oidc/:provider/start?mode=link&project=<project>&env=<env>&redirect_uri=<uri>`
- `POST /oidc/:provider/exchange` with `{ exchange_code }` and active session

## Acceptance
- Link flow requires active user session and returns conflict when identity is already linked elsewhere.
