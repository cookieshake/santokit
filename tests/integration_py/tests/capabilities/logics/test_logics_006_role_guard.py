import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    get_rows,
    jwt_headers,
    signup_and_login,
)

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-006")]


def test_logics_admin_only(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b6")

    api_key = create_api_key(env, project, FIXTURE_DIR, name="admin-key", roles="admin")
    admin_headers = api_key_headers(api_key, project)

    token = signup_and_login(env, project, "user@example.com", "password123")
    user_headers = jwt_headers(token, project)

    no_cred = env.httpToBridge(
        "POST", "/call", json={"path": "logics/admin_only"}, headers={}
    )
    assert no_cred.status_code == 401

    user_resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/admin_only"}, headers=user_headers
    )
    assert user_resp.status_code == 403

    admin_resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/admin_only"}, headers=admin_headers
    )
    assert admin_resp.status_code == 200
    rows = get_rows(admin_resp.json())
    assert len(rows) == 1
