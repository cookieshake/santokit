---
id: LOGICS-007
domain: logics
title: Return consistent errors for common logic failure modes
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_error_cases
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_error_cases"]
---

## Intent
Provide predictable HTTP errors for missing params, missing logic, auth, and type mismatch.

## API Usage
- Missing param: `{"path":"logics/get_items"}`
- Not found: `{"path":"logics/nonexistent"}`
- Invalid type: `{"path":"logics/get_items","params":{"owner_id":123}}`

## Acceptance
- Missing required param, nonexistent logic, unauthenticated request, and invalid type all fail with expected status.
