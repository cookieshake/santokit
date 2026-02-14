---
id: LOGICS-004
domain: logics
title: Validate required logic parameters and bind safely
status: implemented
depends: [LOGICS-001]
spec_refs: ["plan/spec/logics.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_get_items
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
Callers invoking parameterized logic need guaranteed presence and type safety of required inputs before any SQL executes, so bridge validates and binds params before query execution.

## Execution Semantics
- Logic metadata marks required params and expected types.
- Bridge validates presence/type, then binds values as SQL parameters.
- Query executes only after validation passes.

## Observable Outcome
- Calls with complete parameters return filtered data.
- Calls missing required params fail deterministically.

## Usage
- `POST /call` with `{"path":"logics/get_items","params":{"owner_id":"owner-1"}}`

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/get_items","params":{"owner_id":"owner-1"}}` returns HTTP 200 with rows belonging to `owner-1`.
- [ ] The same call with `{"owner_id":"nonexistent-user"}` returns HTTP 200 with an empty `data` array.
- [ ] `POST /call` with `{"path":"logics/get_items"}` (missing `owner_id`) returns HTTP 400.
- [ ] `POST /call` with `{"path":"logics/get_items","params":{"owner_id":123}}` (wrong type) returns HTTP 400.

## Failure Modes
- Required param omitted: request rejected.
- Param type mismatch: request rejected.
