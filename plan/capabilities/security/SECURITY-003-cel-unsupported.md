---
id: SECURITY-003
domain: security
title: Reject unsupported resource-based CEL operators
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_cel_resource_unsupported_operator
code_refs:
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_cel_resource_unsupported_operator"]
---

## Intent
Fail fast when CEL expression cannot be safely converted/evaluated in supported path.

## API Usage
- `POST /call` against a table guarded by unsupported `resource` CEL operator

## Acceptance
- Unsupported resource operator usage returns `400 BAD_REQUEST`.
