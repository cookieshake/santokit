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

## API Usage
- `POST /call` with `{"path":"logics/whoami"}` and authenticated credential

## Acceptance
- `logics/whoami` returns non-empty caller subject.
