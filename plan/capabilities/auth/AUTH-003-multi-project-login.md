---
id: AUTH-003
domain: auth
title: Isolate end-user auth across multiple projects
status: implemented
owners: [hub, bridge]
flow_refs: ["plan/capabilities/auth/README.md"]
spec_refs: ["plan/spec/auth.md", "plan/spec/bridge-hub-protocol.md"]
test_refs:
  - tests/integration_py/tests/test_auth.py::test_enduser_multi_project_login
code_refs:
  - packages/services/hub/
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_enduser_multi_project_login"]
---

## Intent
Prevent project/env credential crossover for end-user sessions.

## Caller Intent
- Use one Hub domain for multiple project/env logins without session collision or privilege leak.

## Execution Semantics
- Hub issues context-bound credentials and isolates cookie/token namespace by project/env.
- Bridge selects one effective credential context and enforces strict binding check.
- Requests cannot reuse credential minted for a different project/env pair.

## Observable Outcome
- Same user can keep independent sessions for multiple projects.
- Cross-project token reuse is rejected even when headers/body attempt override.

## API Usage
- `POST /api/endusers/login` for each project/env context
- `POST /call` with project/env hint headers and matching credential

## Acceptance
- Tokens from project A do not authorize data access in project B and vice versa.

## Failure Modes
- Missing context hint with ambiguous cookie set: request cannot be resolved safely.
- Token/header context mismatch: Bridge denies request.
