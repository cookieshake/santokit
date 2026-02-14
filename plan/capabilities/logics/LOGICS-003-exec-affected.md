---
id: LOGICS-003
domain: logics
title: Return affected count for execute-only SQL logic
status: implemented
depends: [LOGICS-001, CRUD-001]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_insert_item
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Callers running write-only custom SQL need an explicit success signal; bridge detects non-row-returning results and normalizes them to `{ affected: N }` so mutation outcomes are always observable.

## Execution Semantics
- Bridge detects non-row-returning logic execution result.
- Runtime returns normalized `{ affected: N }` payload instead of row array.
- Follow-up CRUD/logic calls can verify persisted mutation side effects.

## Observable Outcome
- Successful mutation returns affected count > 0 when rows changed.
- Response shape is consistent across execute-only logic routes.

## Usage
- `POST /call` with `{"path":"logics/insert_item","params":{"name":"widget","owner_id":"user-42"}}`

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/insert_item","params":{"name":"widget","owner_id":"user-42"}}` returns HTTP 200 with body `{"affected": 1}`.
- [ ] A subsequent read query confirms the inserted row exists in the database.
- [ ] The response contains no `data` array; only the `affected` count field is present.

## Failure Modes
- SQL execution error (constraint/type): logic call fails with error response.
