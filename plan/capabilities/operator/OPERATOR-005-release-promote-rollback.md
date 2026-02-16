---
id: OPERATOR-005
domain: operator
title: Promote and rollback releases across environments
status: planned
depends: [OPERATOR-003, OPERATOR-004]
spec_refs: ["plan/spec/final.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_release_promotion_rollback
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need to move verified config and runtime state from lower environments to production and quickly restore a prior known-good state on incident; this capability controls release pointers across envs with a safe rollback path.

## Execution Semantics
- `release promote` updates the target env's current release pointer to a selected source release. Promotion copies the release pointer only — it does not re-execute schema migrations. The DB in the target env must already be schema-compatible with the promoted release; if not, promotion is rejected. This design ensures promotion is fast and atomic: it is a metadata operation, not a DDL operation.
- `release rollback` resets the target env's current release pointer to a previously known release ID. Like promotion, rollback is a pointer update only; it does not undo DDL. The prior release's permissions and runtime config become active immediately for new requests.
- `release current` shows the active release ID and its metadata for a given env.
- `release list` enumerates recent releases with their IDs, refs, and timestamps to assist safe selection for promotion or rollback targets.

## Observable Outcome
- Target env starts serving policy/schema/runtime behavior from the promoted release snapshot.
- Rollback reverts behavior to a known-good snapshot without rebuilding artifacts or re-running migrations.

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
- Target env DB/schema incompatible with the promoted release: Hub returns HTTP 409; promotion is rejected and CLI exits non-zero.
- Unknown or invalid release ID: rollback/promotion by ID fails with exit code non-zero and Hub returns HTTP 404.
