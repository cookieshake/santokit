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

    role_gate = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/condition_role_echo"},
        headers=headers,
    )
    assert role_gate.status_code == 200, role_gate.text
    assert get_rows(role_gate.json())[0]["sub"] == sub

    insert_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/condition_owner_insert",
            "params": {"owner_id": sub, "name": "allowed-item"},
        },
        headers=headers,
    )
    assert insert_ok.status_code == 200
    assert insert_ok.json()["data"]["affected"] == 1

    insert_denied = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/condition_owner_insert",
            "params": {"owner_id": "other", "name": "denied-item"},
        },
        headers=headers,
    )
    assert insert_denied.status_code == 403

    rows_after = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/items/select",
            "params": {"where": {"name": "denied-item"}},
        },
        headers=headers,
    )
    assert rows_after.status_code == 200
    assert len(get_rows(rows_after.json())) == 0
