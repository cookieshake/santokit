---
id: SECURITY-003
domain: security
title: Reject unsupported resource-based CEL operators
status: planned
depends: [SECURITY-001]
spec_refs: ["plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_cel_resource_unsupported_operator
code_refs:
  - packages/services/bridge/
---

## Intent

Fail fast when a CEL expression in `permissions.yaml` cannot be safely translated into a SQL predicate. Bridge explicitly rejects unsupported condition shapes at request time rather than silently bypassing the policy or applying a best-effort fallback. Operators get a deterministic error that identifies the problem, and no partial or unrestricted result is ever returned.

## Execution Semantics

When Bridge evaluates a rule whose `condition` matches the caller's role, it attempts to translate the CEL expression into a SQL predicate:

1. **Parse** — Bridge parses the CEL expression string into an AST.
2. **Pattern check** — Bridge checks the AST against its supported translation subset. Only the following patterns are translatable:
   - `resource.<column> == request.auth.sub` — dynamic auth binding (SECURITY-001)
   - `resource.<column> == "<literal>"` — static literal equality (SECURITY-002)
3. **Rejection** — If the expression uses any operator or construct outside that subset, Bridge halts immediately and returns `400 BAD_REQUEST` to the caller. No SQL is generated or executed.
4. **No fallback** — There is no permissive fallback. An untranslatable condition is treated as a hard error, not as "allow all" or "deny all" silently. This ensures misconfigured policies surface immediately rather than quietly weakening access control.

Unsupported patterns that trigger rejection include, but are not limited to:

- Comparison operators other than `==`: `resource.score > 10`, `resource.age >= 18`, `resource.rank != 0`
- String methods: `resource.name.startsWith("a")`, `resource.email.contains("@example")`
- Membership / `in` operator: `resource.id in ["user-1", "user-2"]`
- Boolean operators combining multiple resource checks: `resource.a == "x" && resource.b == "y"`
- `request.auth.roles` membership checks: `"admin" in request.auth.roles`
- Any expression that is not a simple binary equality on a single `resource.<column>`

## Observable Outcome

A table guarded by `condition: "resource.score > 10"` returns `400 BAD_REQUEST` for every request regardless of caller identity or role. No rows are returned. The error body identifies the failure:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "unsupported CEL operator in condition: >",
    "requestId": "req-abc123"
  }
}
```

The behavior is the same for all unsupported patterns: deterministic failure, no data exposure.

## Usage

`permissions.yaml` with an unsupported condition:

```yaml
tables:
  products:
    select:
      - roles: [authenticated]
        condition: "resource.score > 10"
        columns: ["id", "name", "score"]
```

`POST /call` that triggers the error:

```http
POST /call
Authorization: Bearer <valid-authenticated-jwt>
Content-Type: application/json

{
  "path": "db/products/select",
  "params": {}
}
```

Response:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "unsupported CEL operator in condition: >",
    "requestId": "req-abc123"
  }
}
```

The same `400 BAD_REQUEST` response is returned for any request hitting this rule, regardless of the caller's identity or additional `params`.

## Acceptance Criteria

- [ ] A rule with `condition: "resource.score > 10"` causes every matching request to return `400 BAD_REQUEST` with `"code": "BAD_REQUEST"` in the error body.
- [ ] A rule with `condition: "resource.name.startsWith('a')"` returns `400 BAD_REQUEST`; no rows are returned.
- [ ] A rule with `condition: "resource.id in ['user-1', 'user-2']"` returns `400 BAD_REQUEST`; no rows are returned.
- [ ] No partial result set is returned alongside the error; the response body contains only the error object.
- [ ] Supported conditions (`resource.<column> == request.auth.sub`, `resource.<column> == "<literal>"`) are not rejected and continue to function correctly.

## Failure Modes

- **Unsupported operator in condition** — Condition uses `>`, `>=`, `<`, `<=`, `!=`, string methods, `in`, or other non-equality constructs: Bridge returns `400 BAD_REQUEST` with an error message identifying the unsupported operator or pattern.
- **Condition parse error** — CEL expression is syntactically invalid (malformed string, unbalanced parentheses, etc.): Bridge returns `400 BAD_REQUEST` before any SQL execution.
- **Policy rollout with unsupported operator** — An operator introduces a new condition using an unsupported pattern; all requests hitting that rule fail with `400 BAD_REQUEST` until the policy is corrected. No existing traffic is silently affected or bypassed.
