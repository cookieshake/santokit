---
id: SECURITY-004
domain: security
title: Enforce column visibility by policy with prefixed fields
status: implemented
owners: [bridge]
flow_refs: ["plan/capabilities/security/README.md"]
spec_refs: ["plan/spec/security.md", "plan/spec/crud.md", "plan/spec/conventions.md"]
test_refs:
  - tests/integration_py/tests/test_security.py::test_column_prefix
code_refs:
  - packages/services/bridge/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_column_prefix"]
---

## Intent
Ensure restricted fields are omitted for lower-privilege readers.

## API Usage
- `POST /call` as admin and viewer for same row and compare visible columns

## Acceptance
- Viewer cannot see restricted prefixed columns while admin can.
