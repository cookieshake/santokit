---
id: OPERATOR-006
domain: operator
title: Manage operator RBAC membership and roles
status: planned
depends: [OPERATOR-001]
spec_refs: ["plan/spec/operator.md", "plan/spec/operator-rbac.md", "plan/spec/cli.md"]
test_refs: []
code_refs: []
---

## Intent
Operators need to delegate project and org operations safely by assigning least-privilege roles to human members; this capability manages invitation, role updates, and removal across operator scopes.

## Execution Semantics
- Invite commands create pending membership records scoped to org/project.
- Role update commands mutate the authorization policy bindings for existing members.
- Remove commands delete membership and revoke future control-plane access for that scope.

## Observable Outcome
- Member can perform only actions allowed by assigned role in the given scope.
- Removed members lose permission to operate that scope.

## Usage
- `stk org invite <email> --role <member|admin>`
- `stk project invite <email> --role <admin|deployer|viewer>`
- `stk org members set-role <user> --role <role>`
- `stk project members set-role <user> --role <role>`
- `stk org remove <user>`
- `stk project remove <user>`

## Acceptance Criteria
- [ ] `stk org invite <email> --role <role>` exits 0 and creates a pending membership record for the target org.
- [ ] `stk project invite <email> --role <role>` exits 0 and creates a pending membership record for the target project.
- [ ] An invited member can perform only actions permitted by their assigned role; unauthorized actions return HTTP 403 or CLI authz error.
- [ ] `stk org members set-role <user> --role <role>` exits 0 and the member's effective permissions update immediately.
- [ ] `stk project members set-role <user> --role <role>` exits 0 and the member's effective permissions update immediately.
- [ ] `stk org remove <user>` exits 0 and subsequent control-plane actions by that user for the org are rejected.
- [ ] `stk project remove <user>` exits 0 and subsequent control-plane actions by that user for the project are rejected.

## Failure Modes
- Caller lacks admin rights in target scope: command fails.
- Invalid role value for scope: command is rejected.
