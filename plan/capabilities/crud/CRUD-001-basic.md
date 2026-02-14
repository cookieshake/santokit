---
id: CRUD-001
domain: crud
title: Basic insert/select and generated ID behavior
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_basic
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_basic"]
---

## Intent
Provide baseline CRUD contract for insert and select with schema-safe defaults.

## Caller Intent
- Insert and retrieve rows without writing SQL while preserving schema and permission constraints.

## Execution Semantics
- Bridge parses `db/{table}/{op}` and validates table/column existence from schema IR.
- Insert path applies ID generation policy and returns created row payload.
- Select path applies permission and where validation before SQL execution.

## Observable Outcome
- Successful insert returns generated/stored row including primary key.
- Select returns rows matching filter and allowed columns only.

## API Usage
- `POST /call` with `{"path":"db/users/insert","params":{"values":{"email":"a@b.com"}}}`
- `POST /call` with `{"path":"db/users/select","params":{"where":{"email":"a@b.com"}}}`

## Acceptance
- Insert returns row with generated ID and select returns matching rows.

## Failure Modes
- Disallowed manual ID input under auto generation policy: request rejected.
- Unknown column or invalid where shape: request rejected.
