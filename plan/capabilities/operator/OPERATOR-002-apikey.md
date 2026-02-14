---
id: OPERATOR-002
domain: operator
title: Create and use project API key
status: implemented
owners: [cli, hub, bridge]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/cli.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_apikey
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_operator_apikey"]
---

## Intent
Operate server/CI credentials through API key lifecycle and verify data-plane access.

## CLI Usage
- `stk apikey create --project <project> --env <env> --name <name> --roles <role1,role2>`
- `stk apikey list --project <project> --env <env>`
- `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

## Acceptance
- API key creation and listing work, and key-authenticated `/call` succeeds.
