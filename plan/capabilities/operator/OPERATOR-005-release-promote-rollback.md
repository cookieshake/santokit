---
id: OPERATOR-005
domain: operator
title: Promote and rollback releases across environments
status: implemented
depends: [OPERATOR-003, OPERATOR-004]
spec_refs: ["plan/spec/operator.md", "plan/spec/final.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_release_promotion_rollback
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need to move verified config and runtime state from lower environments to production and quickly restore a prior known-good state on incident; this capability controls release pointers across envs with a safe rollback path.

## Execution Semantics
- `release promote` updates the target env release pointer to a selected source/current release.
- Promotion does not execute schema migrations by itself; DB compatibility must already hold.
- `release rollback` resets target env pointer to a previous release ID.
- `release current/list` provides operator visibility for safe selection.

## Observable Outcome
- Target env starts serving policy/schema/runtime behavior from promoted release snapshot.
- Rollback reverts behavior to known-good snapshot without rebuilding artifacts.

## Usage
- `stk release promote --project <project> --from dev --to prod`
- `stk release promote --project <project> --to prod --release-id <releaseId>`
- `stk release rollback --project <project> --env prod --to-release-id <previousReleaseId>`
- `stk release current --project <project> --env dev`
- `stk release list --project <project> --env dev --limit 20`

## Acceptance Criteria
- [ ] `stk release promote --from dev --to prod` exits 0 and prod release pointer matches the promoted release ID.
- [ ] A `/call` request against prod after promotion returns responses consistent with the promoted release's schema and permissions.
- [ ] `stk release list` exits 0 and lists at least the current and one prior release.
- [ ] `stk release rollback --to-release-id <previousReleaseId>` exits 0 and prod release pointer reverts to the specified ID.
- [ ] A `/call` request against prod after rollback reflects the rolled-back release behavior.

## Failure Modes
- Target env DB/schema incompatibility: promotion is rejected.
- Unknown or invalid release ID: rollback/promotion by ID fails.
