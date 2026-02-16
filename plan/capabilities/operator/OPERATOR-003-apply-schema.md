---
id: OPERATOR-003
domain: operator
title: Apply schema changes through release pipeline
status: planned
depends: [OPERATOR-001]
spec_refs: ["plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_schema_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need a controlled, repeatable way to evolve database schema through declared refs; this capability ensures schema changes are validated and applied via the release pipeline without direct DB access.

## Execution Semantics
- A `ref` is a commit SHA (e.g., `abc1234`) that identifies a specific, immutable snapshot of schema declarations. It is passed to `stk apply --ref <ref>` and recorded in the release metadata for traceability.
- `--only schema --dry-run` computes the DDL plan from the declared ref and prints the planned operations (e.g., `CREATE TABLE`, `ADD COLUMN`) without executing any DDL or advancing release state. Use this to review changes before committing.
- `--only schema` executes the validated DDL plan against the target env DB connection. Hub performs a drift check after applying: if the actual DB state does not match the declared schema (drift), the pipeline is aborted and no release is created.
- Safe alterations (no `--force` required): `CREATE TABLE`, `ADD COLUMN` with a default or nullable, `CREATE INDEX`, `ADD FOREIGN KEY`.
- Destructive alterations (`--force` required): `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `NOT NULL` strengthening, table recreation. Without `--force`, Hub blocks the apply and exits non-zero.
- Hub advances release state only after all DDL is applied and the drift check passes.

## Observable Outcome
- DB schema converges toward the declared schema ref.
- Env release state reflects successful schema application and includes the `releaseId`.

## Usage
- `stk apply --project <project> --env <env> --only schema --dry-run --ref abc1234`
- `stk apply --project <project> --env <env> --only schema --ref abc1234`
- `stk apply --project <project> --env <env> --only schema --force --ref abc1234`

## Acceptance Criteria
- [ ] `stk apply --only schema --dry-run --ref <commit SHA>` exits 0 and prints the planned DDL operations without modifying the DB.
- [ ] `stk apply --only schema --ref <commit SHA>` exits 0 and DB schema matches the declared ref.
- [ ] The env release state is advanced to reflect the successful schema application, and a `releaseId` is printed.
- [ ] A subsequent `/call` request targeting schema-dependent tables returns HTTP 200.

## Failure Modes
- Destructive DDL without `--force`: Hub blocks the apply, exits non-zero, and prints which operations require `--force`.
- Drift detected (actual DB state differs from declared schema after apply): pipeline is aborted, release is not created, and exit code is non-zero. Drift means the DB was modified outside the release pipeline and the declared schema no longer matches what the DB actually contains.
- Invalid or unknown `ref`: Hub cannot resolve the snapshot; apply exits non-zero.
