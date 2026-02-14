---
id: OPERATOR-001
domain: operator
title: Bootstrap project, env, connection, and initial apply
status: implemented
owners: [cli, hub]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/cli.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_bootstrap
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_operator_bootstrap"]
---

## Intent
Make a project operational from zero with CLI-driven control-plane setup.

## CLI Usage
- `stk project create <project>`
- `stk env create --project <project> dev`
- `stk env create --project <project> prod`
- `stk connections set --project <project> --env dev --name main --engine postgres --db-url <db_url>`
- `stk connections test --project <project> --env dev --name main`
- `stk apply --project <project> --env dev --ref <ref>`

## Acceptance
- `stk project create`, `stk env create`, `stk connections set/test`, and `stk apply` succeed.
