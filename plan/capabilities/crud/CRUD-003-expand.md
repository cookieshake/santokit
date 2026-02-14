---
id: CRUD-003
domain: crud
title: Expand related rows via declared foreign key relation
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/crud/README.md"]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_expand
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_crud_expand"]
---

## Intent
Load related entities in select responses from schema-declared references.

## Caller Intent
- Fetch parent rows and FK-related rows in one request to reduce round trips.

## Execution Semantics
- `expand` entries are validated against declared relation metadata.
- Bridge executes relation-aware query strategy and embeds related object in result row.
- Expand response still applies permission and column filtering for related table.

## Observable Outcome
- Expanded field (for example `user`) appears only when valid relation is requested.
- Non-expanded select returns base row fields only.

## API Usage
- `POST /call` with `{"path":"db/posts/select","params":{"expand":["user"],"where":{"id":"..."}}}`

## Acceptance
- Valid `expand` includes related object; invalid relation returns client error.

## Failure Modes
- Unknown relation name in `expand`: request rejected.
- Missing permission on expanded target table/columns: response denied or filtered.
