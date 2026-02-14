---
id: LOGICS-003
domain: logics
title: Return affected count for execute-only SQL logic
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/logics/README.md"]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_insert_item
code_refs:
  - packages/services/bridge/src/handlers/call.rs
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_logics_insert_item"]
---

## Intent
Normalize mutation-only logic responses without row payload.

## API Usage
- `POST /call` with `{"path":"logics/insert_item","params":{...}}`

## Acceptance
- Execute-only logic returns `{ affected: N }` and mutation is persisted.
