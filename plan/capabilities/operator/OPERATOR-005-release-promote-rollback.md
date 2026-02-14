---
id: OPERATOR-005
domain: operator
title: Promote and rollback releases across environments
status: implemented
owners: [cli, hub]
flow_refs: ["plan/capabilities/operator/README.md"]
spec_refs: ["plan/spec/operator.md", "plan/spec/final.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_release_promotion_rollback
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
verify:
  - cmd: ./scripts/run-integration-tests.sh
    args: ["-k", "test_operator_release_promotion_rollback"]
---

## Intent
Control release pointers safely between dev and prod with recovery path.

## CLI Usage
- `stk release promote --project <project> --from dev --to prod`
- `stk release promote --project <project> --to prod --release-id <releaseId>`
- `stk release rollback --project <project> --env prod --to-release-id <previousReleaseId>`
- `stk release current --project <project> --env dev`
- `stk release list --project <project> --env dev --limit 20`

## Acceptance
- Promotion from dev to prod works and rollback to previous release ID works.
