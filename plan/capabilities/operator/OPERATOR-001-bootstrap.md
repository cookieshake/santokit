---
id: OPERATOR-001
domain: operator
title: Bootstrap project, env, connection, and initial apply
status: implemented
depends: []
spec_refs: ["plan/spec/operator.md", "plan/spec/cli.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_bootstrap
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need a repeatable starting point to make a project fully operational from zero; this capability drives all CLI-based control-plane setup required before any end-user request can be served.

## Execution Semantics
- `stk project create` creates the project scope in Hub.
- `stk env create` allocates environment scopes (`dev`, `prod`) under the project.
- `stk connections set` stores DB connection metadata for the target env.
- `stk connections test` verifies Hub can reach and authenticate to the DB.
- `stk apply` validates schema/permissions input and advances release state for the env.

## Observable Outcome
- The environment has a current release pointer and a usable DB connection.
- Subsequent API key or end-user calls can be authorized against that env context.

## Usage
- `stk project create <project>`
- `stk env create --project <project> dev`
- `stk env create --project <project> prod`
- `stk connections set --project <project> --env dev --name main --engine postgres --db-url <db_url>`
- `stk connections test --project <project> --env dev --name main`
- `stk apply --project <project> --env dev --ref <ref>`

## Acceptance Criteria
- [ ] `stk project create <project>` exits 0 and project scope is visible in Hub.
- [ ] `stk env create` exits 0 for both `dev` and `prod` environments.
- [ ] `stk connections set` exits 0 and connection record is stored in Hub for the target env.
- [ ] `stk connections test` exits 0 and Hub confirms reachability and authentication to the DB.
- [ ] `stk apply` exits 0 and the env has a valid current release pointer afterward.
- [ ] A subsequent `/call` request authorized against that env returns HTTP 200.

## Failure Modes
- Invalid DB URL or unreachable DB: connection test/apply fails.
- Missing required schema/permissions inputs for apply: release is not created.
