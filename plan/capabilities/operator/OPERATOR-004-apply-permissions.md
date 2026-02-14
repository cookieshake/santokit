---
id: OPERATOR-004
domain: operator
title: Apply permissions changes through release pipeline
status: implemented
owners: [cli, hub]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/auth.md", "plan/spec/crud.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_permissions_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_operator_permissions_change"]
---

## Intent
Ship permissions policy updates in a repeatable release operation.

## Operator Intent
- Change access policy declaratively and publish it as the active runtime policy set.

## Execution Semantics
- `stk apply --only permissions,release` validates permission document shape and semantics.
- On success, Hub snapshots policy into release state used by Bridge authorization checks.
- Existing callers are evaluated against the new policy on subsequent requests.

## Observable Outcome
- Policy changes are visible through authorization behavior in Bridge.
- Env points to a release containing updated permissions.

## CLI Usage
- `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

## Acceptance
- Permission ref apply succeeds and reflects updated policy set.

## Failure Modes
- Invalid permission schema or unknown table/column references: apply fails.
- Release gating conditions not met: new policy is not promoted.
