import pytest

from dsl import bootstrap_project, get_rows, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-008")]


def test_logics_condition_gate(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b8")

    token = signup_and_login(env, project, "user@example.com", "password123")
    headers = jwt_headers(token, project)

    whoami = env.httpToBridge(
        "POST", "/call", json={"path": "logics/whoami"}, headers=headers
    )
    assert whoami.status_code == 200
    sub = get_rows(whoami.json())[0]["sub"]

    allowed = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/condition_owner_echo", "params": {"owner_id": sub}},
        headers=headers,
    )
    assert allowed.status_code == 200
    assert get_rows(allowed.json())[0]["owner_id"] == sub

    denied = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/condition_owner_echo", "params": {"owner_id": "other"}},
        headers=headers,
    )
    assert denied.status_code == 403

    malformed = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/condition_malformed", "params": {"owner_id": sub}},
        headers=headers,
    )
    assert malformed.status_code == 400

    unsupported = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/condition_resource_unsupported",
            "params": {"owner_id": sub},
        },
        headers=headers,
    )
    assert unsupported.status_code == 400
