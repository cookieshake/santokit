---
id: LOGICS-005
domain: logics
title: Apply default values for optional logic parameters
status: implemented
depends: [LOGICS-001]
spec_refs: ["plan/spec/logics.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_default_params
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Callers need to invoke logic with fewer arguments while still getting deterministic behavior, so bridge fills in declared defaults for any omitted optional parameters before SQL binding.

## Execution Semantics
- Bridge applies declared defaults for missing optional params.
- Explicitly provided params override defaults.
- Effective param set is type-checked before SQL binding.

## Observable Outcome
- No-arg and partial-arg calls still execute with predictable values.
- Full override uses caller-provided values only.

## Usage
- `POST /call` with `{"path":"logics/default_params"}`
- `POST /call` with `{"path":"logics/default_params","params":{"greeting":"hi"}}`

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/default_params"}` (no params) returns HTTP 200 with the declared default `greeting` value in the response data.
- [ ] `POST /call` with `{"path":"logics/default_params","params":{"greeting":"hi"}}` returns HTTP 200 with `greeting` equal to `"hi"` in the response data.
- [ ] `POST /call` with `{"path":"logics/default_params","params":{"greeting":42}}` (wrong type) returns HTTP 400.

## Failure Modes
- Provided override type mismatch: request rejected.
