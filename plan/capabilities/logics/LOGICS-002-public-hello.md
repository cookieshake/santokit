---
id: LOGICS-002
domain: logics
title: Execute public logic and return greeting
status: implemented
depends: [LOGICS-001]
spec_refs: ["plan/spec/logics.md"]
test_refs:
  - tests/integration_py/tests/test_logics.py::test_logics_public_hello
code_refs:
  - packages/services/bridge/src/handlers/call.rs
---

## Intent
API consumers need to invoke utility logic routes without any credential, so logic routes declared as public auth must be callable without role-specific grants.

## Execution Semantics
- Bridge resolves logic metadata and permits execution under public auth setting.
- SQL result rows are normalized into standard `data` response envelope.

## Observable Outcome
- Caller receives deterministic greeting payload from logic route.
- Same route is callable without role-specific grants.

## Usage
- `POST /call` with `{"path":"logics/public_hello"}`

## Acceptance Criteria
- [ ] `POST /call` with `{"path":"logics/public_hello"}` (no credential) returns HTTP 200 with the expected greeting row in the `data` array.
- [ ] The same call with or without a credential produces identical response content.

## Failure Modes
- Missing logic definition in release snapshot: route returns not found.
