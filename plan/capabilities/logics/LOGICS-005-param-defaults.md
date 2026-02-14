---
id: LOGICS-005
domain: logics
title: Apply default values for optional logic parameters
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_default_params
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_default_params"]
---

## Intent
Guarantee stable runtime behavior when optional parameters are omitted.

## API Usage
- `POST /call` with `{"path":"logics/default_params"}`
- `POST /call` with `{"path":"logics/default_params","params":{"greeting":"hi"}}`

## Acceptance
- No-param, partial override, and full override cases all produce expected values.
