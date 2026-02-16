import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    jwt_headers,
    signup_and_login,
)

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.spec("status_codes")]


def test_spec_status_code_contract_for_common_failures(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "specstatus", "spec-status-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    api_headers = api_key_headers(api_key, project)

    assert (
        env.httpToBridge(
            "POST", "/call", json={"path": "logics/nonexistent"}, headers=api_headers
        ).status_code
        == 404
    )
    assert (
        env.httpToBridge(
            "POST", "/call", json={"path": "logics/admin_only"}, headers={}
        ).status_code
        == 401
    )

    token = signup_and_login(env, project, "spec-user@example.com", "password123")
    assert (
        env.httpToBridge(
            "POST",
            "/call",
            json={"path": "logics/admin_only"},
            headers=jwt_headers(token, project),
        ).status_code
        == 403
    )

    assert (
        env.httpToBridge(
            "POST", "/call", json={"path": "logics/get_items"}, headers=api_headers
        ).status_code
        == 400
    )
