---
id: LOGICS-002
domain: logics
title: Execute public logic and return greeting
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_public_hello
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_public_hello"]
---

## Intent
Support logic route execution for public-auth declared SQL logic.

## API Usage
- `POST /call` with `{"path":"logics/public_hello"}`

## Acceptance
- `logics/public_hello` returns expected greeting row.
