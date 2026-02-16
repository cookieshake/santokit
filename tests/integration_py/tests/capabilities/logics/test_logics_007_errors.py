import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    jwt_headers,
    signup_and_login,
)
from tests.helpers.assertions import assert_error

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-007")]


def test_logics_error_cases(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b7")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    missing = env.httpToBridge(
        "POST", "/call", json={"path": "logics/get_items"}, headers=headers
    )
    assert_error(missing, 400)

    not_found = env.httpToBridge(
        "POST", "/call", json={"path": "logics/nonexistent"}, headers=headers
    )
    assert_error(not_found, 404)

    unauth = env.httpToBridge(
        "POST", "/call", json={"path": "logics/admin_only"}, headers={}
    )
    assert_error(unauth, 401)

    token = signup_and_login(env, project, "err-user@example.com", "password123")
    forbidden = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/admin_only"},
        headers=jwt_headers(token, project),
    )
    assert_error(forbidden, 403)

    invalid_type = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/get_items", "params": {"owner_id": 12345}},
        headers=headers,
    )
    assert_error(invalid_type, 400)
