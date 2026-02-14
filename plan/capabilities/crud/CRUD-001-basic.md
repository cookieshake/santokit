---
id: CRUD-001
domain: crud
title: Basic insert/select and generated ID behavior
status: implemented
depends: [OPERATOR-001, OPERATOR-003, OPERATOR-004]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_basic
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Provides the baseline CRUD contract for insert and select so that callers can insert and retrieve rows without writing SQL while preserving schema and permission constraints.

## Execution Semantics
- Bridge parses `db/{table}/{op}` and validates table/column existence from schema IR.
- Insert path applies ID generation policy and returns created row payload.
- Select path applies permission and where validation before SQL execution.

## Observable Outcome
- Successful insert returns generated/stored row including primary key.
- Select returns rows matching filter and allowed columns only.

## Usage
- `POST /call` with `{"path":"db/users/insert","params":{"values":{"email":"a@b.com"}}}`
- `POST /call` with `{"path":"db/users/select","params":{"where":{"email":"a@b.com"}}}`

## Acceptance Criteria
- [ ] Insert with valid payload returns HTTP 200 and response body includes the inserted row with a generated primary key.
- [ ] Inserted row is retrievable via select with a matching `where` filter.
- [ ] Select returns only columns allowed by the caller's permission context.
- [ ] Manually supplying an ID value under an auto-generation policy returns HTTP 400.
- [ ] Insert or select referencing an unknown column returns HTTP 400.
- [ ] Select with a malformed `where` shape returns HTTP 400.

## Failure Modes
- Disallowed manual ID input under auto generation policy: request rejected.
- Unknown column or invalid where shape: request rejected.
