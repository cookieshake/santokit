---
id: SECURITY-002
domain: security
title: Support CEL resource literal equality filtering
status: implemented
owners: [bridge, sql]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/auth.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_cel_resource_literal_condition
code_refs:
  - packages/services/bridge/
  - packages/libs/sql/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_cel_resource_literal_condition"]
---

## Intent
Allow deterministic literal condition checks for resource attributes.

## Caller Intent
- Enforce fixed-value resource filters from policy (for example status gates) without client cooperation.

## Execution Semantics
- CEL literal equality on `resource.<column>` is translated into SQL predicate.
- Predicate is composed with request filter and permission rule outcome.
- Only rows satisfying literal policy survive selection.

## Observable Outcome
- Calls return subset constrained by literal policy regardless of requested where.
- Non-matching rows remain invisible to caller.

## API Usage
- `POST /call` with `{"path":"db/users/select"}` where policy condition includes `resource.<column> == "literal"`

## Acceptance
- Only rows matching literal CEL condition are returned.

## Failure Modes
- Literal type incompatible with column type: policy execution fails.
- Unknown resource column in condition: request/policy evaluation fails.
