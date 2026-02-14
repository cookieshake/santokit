---
id: LOGICS-006
domain: logics
title: Enforce role guard on logic execution
status: implemented
depends: [LOGICS-001, OPERATOR-002]
spec_refs: ["plan/spec/logics.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_admin_only
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Privileged logic routes must be restricted to callers holding the required role claim, so bridge evaluates logic auth metadata and rejects unauthorized callers before any SQL executes.

## Execution Semantics
- Bridge evaluates logic auth metadata against resolved caller roles.
- Unauthorized callers are rejected before SQL execution.
- Authorized callers execute same logic route under identical SQL semantics.

## Observable Outcome
- End-user without required role receives forbidden response.
- Admin/service role caller receives normal logic data response.

## Usage
- `POST /call` with `{"path":"logics/admin_only"}` as end-user and as admin key

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/admin_only"}` using an end-user credential (no admin role) returns HTTP 403.
- [ ] `POST /call` with `{"path":"logics/admin_only"}` using an admin credential returns HTTP 200 with the expected data response.
- [ ] An unauthenticated request to `logics/admin_only` returns HTTP 401.

## Failure Modes
- Role claim missing or stale: request denied.
