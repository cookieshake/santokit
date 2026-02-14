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
- Invite commands create pending membership records scoped to org or project. The invited user must accept before they can act in that scope.
- Role update commands mutate the authorization policy bindings for existing members. Changes take effect immediately for subsequent Hub API calls.
- Remove commands delete membership and revoke future control-plane access for the removed user in that scope.
- The CLI is a thin wrapper over the Hub API. All authorization decisions are enforced by Hub; error responses flow from Hub to the CLI. An unauthorized action returns HTTP 403 from Hub, which the CLI surfaces as a non-zero exit with the error message.

RBAC roles and their permissions:

| Scope   | Role       | Capabilities |
|---------|------------|--------------|
| Org     | `owner`    | Full org management, billing, member removal |
| Org     | `admin`    | Invite/remove members, manage projects |
| Org     | `member`   | Read org resources |
| Project | `admin`    | Full project control: env, connections, API keys, schema, permissions, releases, OIDC |
| Project | `deployer` | schema/permissions apply, release create/promote/rollback |
| Project | `viewer`   | Read-only access to project resources |

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
- [ ] An invited member attempting an action outside their assigned role receives HTTP 403 from Hub and a non-zero CLI exit code.
- [ ] `stk org members set-role <user> --role <role>` exits 0 and the member's effective permissions update immediately.
- [ ] `stk project members set-role <user> --role <role>` exits 0 and the member's effective permissions update immediately.
- [ ] `stk org remove <user>` exits 0 and subsequent control-plane actions by that user for the org are rejected with HTTP 403.
- [ ] `stk project remove <user>` exits 0 and subsequent control-plane actions by that user for the project are rejected with HTTP 403.

## Failure Modes
- Caller lacks admin rights in target scope: Hub returns HTTP 403; CLI exits non-zero.
- Invalid role value for scope (e.g., using an org-only role on a project invite): Hub returns HTTP 422; command is rejected and CLI exits non-zero.
