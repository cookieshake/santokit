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

## CLI Usage
- `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

## Acceptance
- Permission ref apply succeeds and reflects updated policy set.
