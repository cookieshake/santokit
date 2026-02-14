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

## Operator Intent
- Issue service credentials for non-human callers and rotate/revoke without downtime.

## Execution Semantics
- `stk apikey create` creates a key record bound to project/env and role set.
- The plaintext key is emitted once; Hub stores only the managed key entity thereafter.
- `stk apikey list` queries key metadata (`status`, role bindings, usage timestamps).
- `stk apikey revoke` marks the key unusable so Bridge auth rejects future use.

## Observable Outcome
- Service can authenticate to Bridge using `X-Santokit-Api-Key` while key is active.
- Revoked key can no longer authorize requests.

## CLI Usage
- `stk apikey create --project <project> --env <env> --name <name> --roles <role1,role2>`
- `stk apikey list --project <project> --env <env>`
- `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

## Acceptance
- API key creation and listing work, and key-authenticated `/call` succeeds.

## Failure Modes
- Insufficient operator privileges: create/list/revoke fails with authz error.
- Invalid role bindings: key creation is rejected.
