---
id: OPERATOR-004
domain: operator
title: Apply permissions changes through release pipeline
status: implemented
depends: [OPERATOR-001]
spec_refs: ["plan/spec/operator.md", "plan/spec/auth.md", "plan/spec/crud.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_permissions_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need to update access policy declaratively and publish it as the active runtime policy set; this capability ships permissions changes through the release pipeline so Bridge enforces them immediately on subsequent requests.

## Execution Semantics
- `stk apply --only permissions,release` validates permission document shape and semantics.
- On success, Hub snapshots policy into release state used by Bridge authorization checks.
- Existing callers are evaluated against the new policy on subsequent requests.

## Observable Outcome
- Policy changes are visible through authorization behavior in Bridge.
- Env points to a release containing updated permissions.

## Usage
- `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

## Acceptance Criteria
- [ ] `stk apply --only permissions,release --ref <ref>` exits 0.
- [ ] The env release pointer is updated to a release containing the new permissions snapshot.
- [ ] A `/call` request that was previously denied is now permitted under the updated policy (HTTP 200).
- [ ] A `/call` request that was previously permitted is now denied under the updated policy (HTTP 403).

## Failure Modes
- Invalid permission schema or unknown table/column references: apply fails.
- Release gating conditions not met: new policy is not promoted.
