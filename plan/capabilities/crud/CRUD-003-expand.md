---
id: CRUD-003
domain: crud
title: Expand related rows via declared foreign key relation
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/crud.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_crud.py::test_crud_expand
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent
Allows callers to fetch parent rows and their FK-related rows in a single request by declaring `expand` entries, reducing round trips for relational data access.

## Execution Semantics
- `expand` entries are validated against declared relation metadata.
- Bridge executes relation-aware query strategy and embeds related object in result row.
- Expand response still applies permission and column filtering for related table.

## Observable Outcome
- Expanded field (for example `user`) appears only when valid relation is requested.
- Non-expanded select returns base row fields only.

## Usage
- `POST /call` with `{"path":"db/posts/select","params":{"expand":["user"],"where":{"id":"..."}}}`

## Acceptance Criteria
- [ ] Select with a valid `expand` entry returns HTTP 200 and each result row contains the related object nested under the declared relation name.
- [ ] Select without `expand` returns HTTP 200 with base row fields only; no relation object is present.
- [ ] Select with an `expand` entry for an undeclared relation name returns HTTP 400.
- [ ] Expanded related rows are filtered to columns permitted by the caller's permission context on the related table.
- [ ] Missing permission on the expanded target table results in the related object being omitted or the request being denied per policy.

## Failure Modes
- Unknown relation name in `expand`: request rejected.
- Missing permission on expanded target table/columns: response denied or filtered.
