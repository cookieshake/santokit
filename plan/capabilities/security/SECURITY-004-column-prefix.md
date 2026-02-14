---
id: SECURITY-004
domain: security
title: Enforce column visibility via explicit permissions.yaml column lists with test fixture validation
status: implemented
depends: [CRUD-001]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_prefix
code_refs:
  - packages/services/bridge/
---

## Intent
Ensure restricted fields are omitted for lower-privilege readers using explicit column lists declared in `permissions.yaml`. Column access control is fully explicit: no implicit filtering based on column name prefixes occurs.

## Execution Semantics
- Each rule in `permissions.yaml` may declare a `columns` list specifying allowed columns for that role.
- If `columns` is omitted or set to `["*"]`, all columns are allowed for that rule.
- If `columns` lists specific column names, only those columns are projected in select responses and permitted in write payloads.
- Bridge projects query/result set to allowed columns before response serialization.
- Different credentials over the same row observe different column subsets based solely on their rule's `columns` list.

## Observable Outcome
- Admin role (with broader or unrestricted `columns`) sees full or broader field set.
- Restricted roles receive only columns explicitly listed in their rule's `columns` field.
- No columns are filtered based on name prefixes (`c_`, `p_`, `_`, etc.); only explicit policy determines visibility.

## Usage
- `POST /call` as admin and viewer for same row and compare visible columns

## Acceptance Criteria
- [ ] Viewer role receives only the columns explicitly listed in their `permissions.yaml` rule.
- [ ] Admin role receives the columns explicitly listed in their `permissions.yaml` rule (or all columns if unrestricted).
- [ ] Columns absent from a role's `columns` list are not present in the response.
- [ ] Column names with any prefix (e.g., `c_`, `p_`, `_`) are not implicitly filtered; only the explicit list governs access.

## Failure Modes
- Policy omits required operational column: caller sees incomplete data by design.
- Role not matched by rule set: access denied.
