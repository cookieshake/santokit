import pytest

from dsl import bootstrap_project, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/cel_condition_unsupported"

pytestmark = [pytest.mark.domain("security"), pytest.mark.capability("SECURITY-003")]


def test_cel_resource_unsupported_operator(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "cel_unsup", "cel-unsup-1")
    token = signup_and_login(env, project, "unsupported@example.com", "pw123")
    headers = jwt_headers(token, project)

    select_resp = env.httpToBridge(
        "POST", "/call", json={"path": "db/users/select", "params": {}}, headers=headers
    )
    assert select_resp.status_code == 400
    body = select_resp.json()
    assert "error" in body
    assert "unsupported" in body["error"]["message"].lower()
