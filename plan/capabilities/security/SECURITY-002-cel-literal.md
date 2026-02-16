---
id: SECURITY-002
domain: security
title: Support CEL resource literal equality filtering
status: implemented
depends: [CRUD-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/capabilities/security/test_security_002_cel_literal.py::test_cel_resource_literal_condition
code_refs:
  - tests/integration_py/tests/capabilities/security/test_security_002_cel_literal.py
---

## Intent

Operators write static literal equality checks in `permissions.yaml` conditions to enforce fixed-value resource filters — for example, restricting a role to only active records. This is distinct from SECURITY-001's dynamic auth binding: a literal condition (`resource.status == "active"`) compares a column against a constant string, not against any caller-supplied value. The filter is unconditional; it applies regardless of what the caller sends and regardless of who the caller is.

## Execution Semantics

Bridge applies the following steps when a rule's `condition` contains a literal equality check:

1. **Rule loading** — Bridge loads permission rules from the active release, including any `condition` expressions on each rule.
2. **Role match** — The caller's JWT claims are checked against the rule's `roles` list. If no role matches, evaluation proceeds to the next rule.
3. **Condition translation** — On a role match, Bridge parses the CEL expression. A pattern of the form `resource.<column> == "<literal>"` is translated into a static SQL predicate: `WHERE <column> = '<literal>'`. The literal value is embedded as a bound parameter, not interpolated as raw SQL.
4. **Predicate composition** — The static predicate is composed with any caller-provided `where` clause under AND. Because the literal predicate is always present, callers cannot retrieve rows that do not satisfy it, even if they construct a `where` that would otherwise match those rows.
5. **Execution** — The composed query executes. Only rows satisfying the literal predicate (and any additional caller filter) are returned or affected.

## Observable Outcome

A policy with `condition: "resource.status == 'active'"` on a `select` rule means that rows where `status = 'inactive'` are never returned to any caller matching that rule, regardless of what `where` the caller provides. If a caller sends `{"where": {"id": "some-inactive-user"}}`, the effective query is `WHERE status = 'active' AND id = 'some-inactive-user'` — the row is filtered out if `status` is not `'active'`.

An admin rule without a condition sees all rows. Only the restricted rule applying the literal filter is affected.

## Usage

`permissions.yaml` — literal status gate:

```yaml
tables:
  users:
    select:
      - roles: [authenticated]
        condition: "resource.status == 'active'"
        columns: ["id", "email", "name"]
      - roles: [admin]
        columns: ["*"]
```

`POST /call` as an authenticated user:

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "db/users/select",
  "params": {}
}
```

Response (only active rows returned, inactive rows absent):

```json
{
  "rows": [
    { "id": "user-1", "email": "user1@example.com", "name": "Alice" }
  ]
}
```

Row `{ "id": "user-2", "status": "inactive" }` is not present in the response even though no client-side filter was applied.

## Acceptance Criteria

- [ ] Rows where `status = 'active'` are returned to callers matching the `authenticated` rule with the literal condition.
- [ ] Rows where `status = 'inactive'` are not present in the response for any caller matching the literal-condition rule, regardless of caller-provided `where`.
- [ ] A caller providing `{"where": {"status": "inactive"}}` receives an empty result set rather than the inactive rows — the policy predicate takes precedence.
- [ ] Admin role (with no condition) can still retrieve all rows including inactive ones.

## Failure Modes

- **Type mismatch** — Literal value type is incompatible with the target column's database type (e.g., string literal against an integer column): Bridge returns `400 BAD_REQUEST`.
- **Unknown resource column** — Condition references `resource.<column>` where `<column>` does not exist in the target table schema: Bridge returns `400 BAD_REQUEST`.
- **Missing auth context** — Request carries no bearer token against a rule requiring an authenticated role: Bridge returns `401 UNAUTHORIZED`.
- **Role mismatch** — Caller holds no role matching any rule for the requested operation: Bridge returns `403 FORBIDDEN`.
