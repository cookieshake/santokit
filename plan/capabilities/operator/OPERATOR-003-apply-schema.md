---
id: OPERATOR-003
domain: operator
title: Apply schema changes through release pipeline
status: implemented
owners: [cli, hub]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_schema_change
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_operator_schema_change"]
---

## Intent
Ensure schema evolution is applied via declared refs and control-plane orchestration.

## CLI Usage
- `stk apply --project <project> --env <env> --only schema --dry-run --ref <ref>`
- `stk apply --project <project> --env <env> --only schema --ref <ref>`

## Acceptance
- `stk apply --ref <schema-ref>` completes successfully for target env.
