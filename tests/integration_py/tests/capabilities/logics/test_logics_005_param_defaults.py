import pytest

from dsl import bootstrap_project, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-005")]


def test_logics_default_params(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b5")

    resp1 = env.httpToBridge(
        "POST", "/call", json={"path": "logics/default_params"}, headers={}
    )
    assert resp1.status_code == 200
    rows1 = get_rows(resp1.json())
    assert len(rows1) == 1
    assert rows1[0]["greeting"] == "hello"

    resp2 = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/default_params", "params": {"greeting": "hi"}},
        headers={},
    )
    assert resp2.status_code == 200
    rows2 = get_rows(resp2.json())
    assert len(rows2) == 1
    assert rows2[0]["greeting"] == "hi"

    wrong_type = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/default_params", "params": {"greeting": 42}},
        headers={},
    )
    assert wrong_type.status_code == 400
