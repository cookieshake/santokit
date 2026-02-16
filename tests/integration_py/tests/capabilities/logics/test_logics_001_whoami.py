import pytest

from dsl import bootstrap_project, get_rows, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-001")]


def test_logics_whoami(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b1")

    token = signup_and_login(env, project, "user@example.com", "password123")
    headers = jwt_headers(token, project)

    resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/whoami"}, headers=headers
    )
    assert resp.status_code == 200
    rows = get_rows(resp.json())
    assert len(rows) == 1
    assert "sub" in rows[0]
    assert rows[0]["sub"]
