---
id: OPERATOR-003
domain: operator
title: Apply schema changes through release pipeline
status: implemented
depends: [OPERATOR-001]
spec_refs: ["plan/spec/operator.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_schema_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need a controlled, repeatable way to evolve database schema through declared refs; this capability ensures schema changes are validated and applied via the release pipeline without direct DB access.

## Execution Semantics
- `--only schema --dry-run` computes/prints planned schema operations without mutating DB.
- `--only schema` executes schema plan against target env connections.
- Hub validates compatibility constraints before applying and only advances release state on success.

## Observable Outcome
- DB schema converges toward declared schema ref.
- Env release state reflects successful schema application.

## Usage
- `stk apply --project <project> --env <env> --only schema --dry-run --ref <ref>`
- `stk apply --project <project> --env <env> --only schema --ref <ref>`

## Acceptance Criteria
- [ ] `stk apply --only schema --dry-run` exits 0 and prints the planned operations without modifying the DB.
- [ ] `stk apply --only schema --ref <ref>` exits 0 and DB schema matches the declared ref.
- [ ] The env release state is advanced to reflect the successful schema application.
- [ ] A subsequent `/call` request targeting schema-dependent tables returns HTTP 200.

## Failure Modes
- Destructive or invalid plan without explicit override policy: apply is blocked.
- DB drift or migration conflict: release advancement is prevented.
