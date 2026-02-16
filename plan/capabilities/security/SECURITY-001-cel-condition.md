---
id: SECURITY-001
domain: security
title: Inject CEL condition into row-level SQL filtering
status: planned
depends: [CRUD-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/test_security.py::test_cel_condition
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
---

## Intent

Operators write CEL conditions in `permissions.yaml` to express owner-like row-level access control. Bridge translates supported `resource.*` checks into SQL predicates at request time, so callers only ever touch rows the policy permits. Clients never embed their own identity filters; the policy enforces scope server-side.

## Execution Semantics

Bridge applies the following steps on every request that reaches a rule with a `condition` field:

1. **Rule loading** — Bridge loads permission rules from the active release. Each rule carries its `roles` list, optional `condition` string, and optional `columns` list.
2. **Role match** — The caller's JWT claims are checked against the rule's `roles` list. If no role matches, evaluation moves to the next rule. If no rule matches at all, the request is denied with `403 FORBIDDEN`.
3. **Condition translation** — When a role match is found and a `condition` is present, Bridge parses the CEL expression and translates supported patterns into a SQL predicate. The pattern `resource.user_id == request.auth.sub` becomes `WHERE user_id = :auth_sub`, where `:auth_sub` is a bound parameter populated from the caller's JWT `sub` claim.
4. **Predicate composition** — The condition-derived SQL predicate is combined with any user-provided `where` clause under AND. The caller cannot supply a `where` that bypasses the policy predicate; it can only narrow further.
5. **Execution** — The composed query is executed. Only rows satisfying both the policy predicate and any caller-provided filter are returned or affected.

## Observable Outcome

User A with `sub=user-1` calls `db/users/select` under a policy containing `condition: "resource.id == request.auth.sub"`. Bridge injects `WHERE id = 'user-1'` into the query. User A sees exactly one row: their own. If User A additionally provides `{"where": {"name": "Alice"}}`, the effective query is `WHERE id = 'user-1' AND name = 'Alice'` — the policy predicate cannot be removed.

User B with `sub=user-2` executing the same call gets `WHERE id = 'user-2'` injected and cannot retrieve user-1's row under any circumstances.

For update operations, the same predicate is injected into the `WHERE` clause of the `UPDATE` statement. An attempt by user-1 to update user-2's row produces zero affected rows (the predicate filters it out before write).

## Usage

`permissions.yaml` — owner-read policy:

```yaml
tables:
  users:
    select:
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["id", "email", "name"]
    update:
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
```

`POST /call` request with end-user bearer token:

```http
POST /call
Authorization: Bearer <jwt-for-user-1>
Content-Type: application/json

{
  "path": "db/users/select",
  "params": {}
}
```

Response (user-1 sees only their own row):

```json
{
  "rows": [
    { "id": "user-1", "email": "user1@example.com", "name": "Alice" }
  ]
}
```

## Acceptance Criteria

- [ ] User with `sub=user-1` calling `db/users/select` sees only the row where `id = 'user-1'`; no other rows are present in the response.
- [ ] User with `sub=user-2` calling the same endpoint cannot retrieve the row where `id = 'user-1'`; the row is absent from the result.
- [ ] User with `sub=user-1` calling `db/users/update` with a payload targeting `id = 'user-2'` affects zero rows (policy predicate filters out the target).
- [ ] Request with no `Authorization` header against an `authenticated`-role rule returns `401 UNAUTHORIZED`.
- [ ] Request with a valid token whose role is not listed in any matching rule returns `403 FORBIDDEN`.
- [ ] Caller-supplied `where` clause is composed under AND with the condition predicate; it cannot widen the allowed row scope.

## Failure Modes

- **Unsupported CEL pattern** — Condition uses an operator outside the supported translation subset (e.g., `resource.score > 10`): Bridge returns `400 BAD_REQUEST` before query execution. No partial result is produced.
- **Missing auth context** — Request carries no bearer token but the matching rule requires `authenticated` role: Bridge returns `401 UNAUTHORIZED`.
- **Role mismatch** — Caller's token carries roles that match no rule for the requested operation: Bridge returns `403 FORBIDDEN`.
- **Unknown resource column** — Condition references `resource.<column>` where `<column>` does not exist in the target table schema: request returns `400 BAD_REQUEST`.
