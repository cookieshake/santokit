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

## Caller Intent
- Get stable, diagnosable failure semantics for common logic invocation mistakes.

## Execution Semantics
- Validation and routing errors are classified before DB execution.
- Missing required param, unknown logic, unauthenticated access, and type mismatch map to deterministic status classes.
- Error response remains structured for client-side handling.

## Observable Outcome
- Same invalid input yields same error category across calls.
- Successful requests are not silently coerced from invalid payloads.

## API Usage
- Missing param: `{"path":"logics/get_items"}`
- Not found: `{"path":"logics/nonexistent"}`
- Invalid type: `{"path":"logics/get_items","params":{"owner_id":123}}`

## Acceptance
- Missing required param, nonexistent logic, unauthenticated request, and invalid type all fail with expected status.

## Failure Modes
- Ambiguous/combined invalid inputs may prioritize first validation failure by pipeline order.
