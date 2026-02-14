---
id: LOGICS-001
domain: logics
title: Return authenticated subject via system variable
status: implemented
depends: [OPERATOR-001, OPERATOR-003, OPERATOR-004]
spec_refs: ["plan/spec/logics.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_whoami
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Authenticated callers need to identify themselves within custom SQL logic without re-parsing credentials; bridge injects `:auth.sub` so logic SQL can reference the caller directly.

## Execution Semantics
- Bridge extracts auth context from resolved credential and injects `:auth.sub` binding.
- Logic SQL can reference the bound variable in select or predicate clauses.

## Observable Outcome
- Logic response includes current caller subject value.
- Different callers observe their own subject in identical logic call.

## Usage
- `POST /call` with `{"path":"logics/whoami"}` and authenticated credential

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/whoami"}` and a valid credential returns HTTP 200 with a non-empty `sub` value in the response data.
- [ ] Two different authenticated callers calling `logics/whoami` each receive their own distinct subject value.

## Failure Modes
- Missing/invalid credential for authenticated logic: request denied.
