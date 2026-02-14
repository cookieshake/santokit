---
id: OPERATOR-006
domain: operator
title: Manage operator RBAC membership and roles
status: planned
owners: [cli, hub]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/operator-rbac.md", "plan/spec/cli.md"]
test_refs: []
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
verify: []
---

## Intent
Support invitation, role updates, and removal for operator scopes.

## Operator Intent
- Delegate project/org operations safely by assigning least-privilege roles to human operators.

## Execution Semantics
- Invite commands create pending membership records scoped to org/project.
- Role update commands mutate the authorization policy bindings for existing members.
- Remove commands delete membership and revoke future control-plane access for that scope.

## Observable Outcome
- Member can perform only actions allowed by assigned role in the given scope.
- Removed members lose permission to operate that scope.

## CLI Usage
- `stk org invite <email> --role <member|admin>`
- `stk project invite <email> --role <admin|deployer|viewer>`
- `stk org members set-role <user> --role <role>`
- `stk project members set-role <user> --role <role>`
- `stk org remove <user>`
- `stk project remove <user>`

## Acceptance
- Org/project invite, role change, and removal are enforced by RBAC policy.

## Failure Modes
- Caller lacks admin rights in target scope: command fails.
- Invalid role value for scope: command is rejected.
