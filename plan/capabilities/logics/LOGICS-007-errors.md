---
id: LOGICS-007
domain: logics
title: Return consistent errors for common logic failure modes
status: implemented
depends: [LOGICS-001]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_error_cases
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Clients need stable, diagnosable HTTP error responses for common logic invocation mistakes so that missing params, unknown routes, auth failures, and type mismatches are all distinguishable without DB round-trips.

## Execution Semantics
- Validation and routing errors are classified before DB execution.
- Missing required param, unknown logic, unauthenticated access, and type mismatch map to deterministic status classes.
- Error response remains structured for client-side handling.

## Observable Outcome
- Same invalid input yields same error category across calls.
- Successful requests are not silently coerced from invalid payloads.

## Usage
- Missing param: `POST /call` with `{"path":"logics/get_items"}`
- Not found: `POST /call` with `{"path":"logics/nonexistent"}`
- Invalid type: `POST /call` with `{"path":"logics/get_items","params":{"owner_id":123}}`

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/get_items"}` (missing required `owner_id`) returns HTTP 400.
- [ ] `POST /call` with `{"path":"logics/nonexistent"}` returns HTTP 404.
- [ ] `POST /call` with `{"path":"logics/admin_only"}` using no credential returns HTTP 401.
- [ ] `POST /call` with `{"path":"logics/admin_only"}` using an end-user credential without the required role returns HTTP 403.
- [ ] `POST /call` with `{"path":"logics/get_items","params":{"owner_id":123}}` (integer instead of string) returns HTTP 400.
- [ ] All error responses use a structured body (e.g. `{"error": "..."}`) suitable for client-side parsing.

## Failure Modes
- Ambiguous/combined invalid inputs may prioritize first validation failure by pipeline order.
