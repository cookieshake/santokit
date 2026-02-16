import pytest

from dsl import bootstrap_project, get_rows, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/cel_condition_literal"

pytestmark = [pytest.mark.domain("security"), pytest.mark.capability("SECURITY-002")]


def test_cel_resource_literal_condition(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "cel_lit", "cel-lit-1")

    token = signup_and_login(env, project, "literal@example.com", "pw123")
    headers = jwt_headers(token, project)

    insert_allow = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"id": "u1", "email": "allow@example.com", "name": "Allowed"}
            },
        },
        headers=headers,
    )
    assert insert_allow.status_code == 200

    insert_deny = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"id": "u2", "email": "deny@example.com", "name": "Denied"}
            },
        },
        headers=headers,
    )
    assert insert_deny.status_code == 200

    select_resp = env.httpToBridge(
        "POST", "/call", json={"path": "db/users/select", "params": {}}, headers=headers
    )
    assert select_resp.status_code == 200
    rows = get_rows(select_resp.json())
    assert len(rows) == 1
    assert rows[0]["name"] == "Allowed"
