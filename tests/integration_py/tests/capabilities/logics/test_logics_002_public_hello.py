import pytest

from dsl import bootstrap_project, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-002")]


def test_logics_public_hello(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b2")

    resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/public_hello"}, headers={}
    )
    assert resp.status_code == 200
    rows = get_rows(resp.json())
    assert len(rows) == 1
    assert rows[0]["greeting"] == "hello"
