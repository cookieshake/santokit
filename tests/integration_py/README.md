# Santokit Integration Tests (Python)

This package provides an integration-test harness using Testcontainers.

Planned scenarios (draft):
- bootstrap: hub/bridge up -> project/env -> connection -> apply -> release
- drift gate: snapshot -> drift -> promote blocked -> drift fixed -> promote ok
- auth/runtime: api key + bearer + cookie access token -> /call

Flow docs mapping (draft):

| Flow doc | Test file |
|----------|----------|
| `plan/flows/operator.md` | `tests/integration_py/tests/test_operator.py` |
| `plan/flows/auth.md` | `tests/integration_py/tests/test_auth.py` |
| `plan/flows/crud.md` | `tests/integration_py/tests/test_crud.py` |
| `plan/flows/security.md` | `tests/integration_py/tests/test_security.py` |
| `plan/flows/logics.md` | `tests/integration_py/tests/test_logics.py` |

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

From repo root:
```sh
./scripts/run-integration-tests.sh
```

Notes:
- This suite builds Docker images for hub/bridge/cli via compose.
- The CLI container is kept running and invoked via docker exec.
- Optional: OIDC debugger UI is available via the `oidc` compose profile (`COMPOSE_PROFILES=oidc docker compose -f tests/integration_py/docker-compose.yaml up -d oidc-debugger`).

Notes:
- Tests will spin up Postgres with testcontainers.
- Hub/Bridge will be launched as subprocesses in tests.
