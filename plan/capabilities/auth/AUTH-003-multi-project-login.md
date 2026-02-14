---
id: AUTH-003
domain: auth
title: Isolate end-user auth across multiple projects
status: implemented
depends: [AUTH-001]
spec_refs: ["plan/spec/auth.md", "plan/spec/bridge-hub-protocol.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_multi_project_login
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
---

## Intent
End users operating across multiple project/env contexts need independent sessions on a single Hub domain without credential crossover or privilege leak between projects.

## Execution Semantics
- Hub issues context-bound credentials and isolates cookie/token namespace by project/env.
- Bridge selects one effective credential context and enforces strict binding check.
- Requests cannot reuse credential minted for a different project/env pair.

## Observable Outcome
- Same user can keep independent sessions for multiple projects.
- Cross-project token reuse is rejected even when headers/body attempt override.

## Usage
- `POST /api/endusers/login` for each project/env context
- `POST /call` with project/env hint headers and matching credential

## Acceptance Criteria
- [ ] A user can log in to project A and project B separately, receiving distinct `access_token` values for each.
- [ ] `POST /call` with the project A token and project A context headers returns HTTP 200.
- [ ] `POST /call` with the project A token but project B context headers returns HTTP 401 or HTTP 403.
- [ ] `POST /call` with the project B token but project A context headers returns HTTP 401 or HTTP 403.
- [ ] Both sessions remain independently valid concurrently without invalidating each other.

## Failure Modes
- Missing context hint with ambiguous cookie set: request cannot be resolved safely.
- Token/header context mismatch: Bridge denies request.
