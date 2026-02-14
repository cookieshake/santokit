---
id: LOGICS-004
domain: logics
title: Validate required logic parameters and bind safely
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_get_items
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_get_items"]
---

## Intent
Require declared parameters and apply them as safe SQL bindings.

## API Usage
- `POST /call` with `{"path":"logics/get_items","params":{"owner_id":"owner-1"}}`

## Acceptance
- Owner-scoped query returns matching rows and empty for non-matches.
