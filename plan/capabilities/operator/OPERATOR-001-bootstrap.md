---
id: OPERATOR-001
domain: operator
title: Bootstrap project, env, connection, and initial apply
status: planned
depends: []
spec_refs: ["plan/spec/cli.md", "plan/spec/schema.md"]
test_refs:
  - tests/integration_py/tests/test_operator.py::test_operator_bootstrap
code_refs:
  - packages/tools/cli/
  - packages/services/hub/
---

## Intent
Operators need a repeatable starting point to make a project fully operational from zero; this capability drives all CLI-based control-plane setup required before any end-user request can be served.

## Execution Semantics
- `stk project create` registers the project scope in Hub. If the project name already exists, Hub returns HTTP 409 CONFLICT and the CLI exits non-zero.
- `stk env create` allocates named environment scopes (`dev`, `prod`) under the project. Each env maintains independent connection records and release state.
- `stk connections set` stores DB connection metadata (engine, URL) for the target env. The URL is stored encrypted; it is not echoed back after creation.
- `stk connections test` verifies that Hub can establish and authenticate a connection to the DB using the stored credentials. Exit code 0 means the round-trip succeeded.
- `stk apply` drives the full release pipeline in order: schema validate → schema plan → schema apply (DDL) → drift check → permissions apply → release create. On success the CLI prints the resulting `releaseId`. A `ref` is a commit SHA (e.g., `abc1234`) that identifies a specific snapshot of schema and permissions inputs; it is stored in the release record for auditability and idempotency.

## Observable Outcome
- The environment has a current `releaseId` and a usable DB connection.
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
- [ ] `stk apply` exits 0, prints a `releaseId`, and the env has a valid current release pointer afterward.
- [ ] A subsequent `/call` request authorized against that env returns HTTP 200.

## Failure Modes
- Duplicate project name: Hub returns HTTP 409 CONFLICT; CLI exits non-zero with a descriptive message.
- Invalid DB URL or unreachable DB: `stk connections test` and `stk apply` exit non-zero; no release is created.
- Missing required schema/permissions inputs for apply: validation fails, release pipeline is aborted, and exit code is non-zero.
