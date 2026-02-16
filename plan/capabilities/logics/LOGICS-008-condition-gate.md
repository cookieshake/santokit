---
id: LOGICS-008
domain: logics
title: Evaluate CEL condition gate before logic execution
status: in_progress
depends: [LOGICS-001, LOGICS-004]
spec_refs: ["plan/spec/errors.md", "plan/spec/final.md"]
test_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_008_condition_gate.py::test_logics_condition_gate
code_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_008_condition_gate.py
---

## Intent
Operators need policy-like request guards for custom logic routes, so Bridge must evaluate a CEL expression before SQL execution and deny calls whose request context does not satisfy the declared condition.

## Execution Semantics
Logic metadata MAY declare a `condition` string in frontmatter. Bridge evaluates this CEL expression only after route resolution, auth mode checks, role checks, and parameter type validation pass.

Evaluation context for LOGICS-008 is intentionally request-scoped:

1. `request.auth.sub`
2. `request.auth.roles`
3. `request.params.*`

`resource.*` identifiers are not supported in this capability and must fail closed.

Outcome mapping:

1. CEL evaluates to `true` -> continue to SQL execution.
2. CEL evaluates to `false` -> reject with HTTP 403.
3. CEL parse/evaluation failure or unsupported identifier shape -> reject with HTTP 400.

SQL execution MUST NOT begin when condition evaluation fails.

## Observable Outcome
- Calls with matching request context succeed normally and return logic output.
- Calls with non-matching request context are denied with HTTP 403.
- Invalid CEL or unsupported references are rejected with HTTP 400.
- Condition failures happen before any DB side effect.

## Usage
Logic definition with request-scoped condition:

```yaml
auth: authenticated
params:
  owner_id:
    type: string
    required: true
condition: request.params.owner_id == request.auth.sub
```

Allowed call:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/condition_owner_echo",
  "params": { "owner_id": "<same-as-auth-sub>" }
}
```

Denied call:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{
  "path": "logics/condition_owner_echo",
  "params": { "owner_id": "someone-else" }
}
```

## Acceptance Criteria
- [ ] Logic with `condition: request.params.owner_id == request.auth.sub` returns HTTP 200 when param and auth subject match.
- [ ] The same logic returns HTTP 403 when param and auth subject do not match.
- [ ] Logic with malformed CEL expression in `condition` returns HTTP 400.
- [ ] Logic with `condition` referencing `resource.*` returns HTTP 400 (unsupported for LOGICS-008).
- [ ] Any condition failure blocks SQL execution.

## Failure Modes
- CEL parse error (malformed expression): HTTP 400.
- CEL evaluation error (type mismatch or unknown symbol): HTTP 400.
- Condition evaluates to false: HTTP 403.
- Unsupported identifier family (`resource.*`) used in logic `condition`: HTTP 400.
