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

## Caller Intent
- Run write-only custom SQL and still get an explicit success signal.

## Execution Semantics
- Bridge detects non-row-returning logic execution result.
- Runtime returns normalized `{ affected: N }` payload instead of row array.
- Follow-up CRUD/logic calls can verify persisted mutation side effects.

## Observable Outcome
- Successful mutation returns affected count > 0 when rows changed.
- Response shape is consistent across execute-only logic routes.

## API Usage
- `POST /call` with `{"path":"logics/insert_item","params":{...}}`

## Acceptance
- Execute-only logic returns `{ affected: N }` and mutation is persisted.

## Failure Modes
- SQL execution error (constraint/type): logic call fails with error response.
