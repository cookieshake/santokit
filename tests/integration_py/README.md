# Santokit Integration Tests (Python)

This package provides an integration-test harness using Testcontainers.

Planned scenarios (draft):
- bootstrap: hub/bridge up -> project/env -> connection -> apply -> release
- drift gate: snapshot -> drift -> promote blocked -> drift fixed -> promote ok
- auth/runtime: api key + bearer + cookie access token -> /call

Capability mapping:

| Capability domain | Test file |
|-------------------|-----------|
| `plan/capabilities/operator/*` | `tests/integration_py/tests/capabilities/operator/test_operator_*.py` |
| `plan/capabilities/auth/*` | `tests/integration_py/tests/capabilities/auth/test_auth_*.py` |
| `plan/capabilities/crud/*` | `tests/integration_py/tests/capabilities/crud/test_crud_*.py` |
| `plan/capabilities/security/*` | `tests/integration_py/tests/capabilities/security/test_security_*.py` |
| `plan/capabilities/logics/*` | `tests/integration_py/tests/capabilities/logics/test_logics_*.py` |

Cross-capability spec contracts:
- `tests/integration_py/tests/spec/test_spec_*.py`
- Coverage matrix: `tests/integration_py/tests/spec/coverage_matrix.md`

Prereqs:
- Docker (for docker-compose + testcontainers)
- flox (for python/uv)

Usage (local):
1) `flox activate` in repo root
2) `cd tests/integration_py`
3) `uv venv --clear`
4) `uv pip install -e .`
5) `uv run pytest`

One-liner:
```sh
flox activate -- sh -lc 'cd tests/integration_py && uv venv --clear && uv pip install -e . && uv run pytest'
```

From repo root (strict capability validation + full suite):
```sh
./scripts/run-integration-tests.sh
```

Run only tests referenced by capability docs:
```sh
./scripts/run-integration-tests.sh --from-plan
```

Run a filtered capability subset:
```sh
./scripts/run-integration-tests.sh --domain auth
./scripts/run-integration-tests.sh --capability AUTH-001
./scripts/run-integration-tests.sh --status implemented
```

Run spec-only tests:
```sh
flox activate -- sh -lc 'cd tests/integration_py && uv run pytest tests/spec -q'
```

Notes:
- This suite builds Docker images for hub/bridge/cli via compose.
- The CLI container is kept running and invoked via docker exec.
- Optional: OIDC debugger UI is available via the `oidc` compose profile (`COMPOSE_PROFILES=oidc docker compose -f tests/integration_py/docker-compose.yaml up -d oidc-debugger`).

Notes:
- Tests will spin up Postgres with testcontainers.
- Hub/Bridge will be launched as subprocesses in tests.
