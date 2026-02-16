---
id: OPERATOR-004
domain: operator
title: Apply permissions changes through release pipeline
status: planned
depends: [OPERATOR-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_permissions_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need to update access policy declaratively and publish it as the active runtime policy set; this capability ships permissions changes through the release pipeline so Bridge enforces them immediately on subsequent requests.

## Execution Semantics
- `stk apply --only permissions,release` runs only the permissions and release steps of the pipeline, skipping the schema DDL step entirely. This is appropriate when schema is already up to date and only the policy document has changed.
- The pipeline order for `--only permissions,release` is: permissions validate → permissions apply → release create. Hub validates the permission document shape and semantics (table/column references must exist in the current schema) before applying.
- On success, Hub snapshots the policy into a new release record and updates the env's current release pointer. Bridge picks up the new release on its next reload cycle and evaluates all subsequent requests against the updated policy.
- The `ref` identifies the permissions snapshot being applied and is stored in the release record for auditability.
- Passing `--only permissions,release` does not perform a drift check or execute any DDL.

## Observable Outcome
- Policy changes are visible through authorization behavior in Bridge.
- Env points to a new release containing the updated permissions snapshot, and the `releaseId` is printed on success.

## Usage
- `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

## Acceptance Criteria
- [ ] `stk apply --only permissions,release --ref <ref>` exits 0 and prints the new `releaseId`.
- [ ] The env release pointer is updated to a release containing the new permissions snapshot.
- [ ] A `/call` request that was previously denied is now permitted under the updated policy (HTTP 200).
- [ ] A `/call` request that was previously permitted is now denied under the updated policy (HTTP 403).

## Failure Modes
- Invalid permission document shape or semantic errors (unknown table/column references): validation fails, apply exits non-zero with HTTP 422, and no release is created.
- Release gating conditions not met (e.g., schema drift present): new policy is not promoted and exit code is non-zero.
