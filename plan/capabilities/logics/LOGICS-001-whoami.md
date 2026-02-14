---
id: LOGICS-001
domain: logics
title: Return authenticated subject via system variable
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_whoami
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_whoami"]
---

## Intent
Expose `:auth.sub` to SQL logic execution context.

## Caller Intent
- Let custom logic identify the authenticated caller without duplicating auth parsing in SQL.

## Execution Semantics
- Bridge extracts auth context from resolved credential and injects `:auth.sub` binding.
- Logic SQL can reference the bound variable in select or predicate clauses.

## Observable Outcome
- Logic response includes current caller subject value.
- Different callers observe their own subject in identical logic call.

## API Usage
- `POST /call` with `{"path":"logics/whoami"}` and authenticated credential

## Acceptance
- `logics/whoami` returns non-empty caller subject.

## Failure Modes
- Missing/invalid credential for authenticated logic: request denied.
