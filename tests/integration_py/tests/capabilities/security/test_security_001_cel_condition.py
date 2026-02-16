import pytest

from dsl import bootstrap_project, get_rows, jwt_headers

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/cel_condition"

pytestmark = [pytest.mark.domain("security"), pytest.mark.capability("SECURITY-001")]


def test_cel_condition(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "cel", "cel-1")

    pw = "password123"
    env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={
            "project": project,
            "env": "dev",
            "email": "user_a@example.com",
            "password": pw,
        },
    )
    login_a = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={
            "project": project,
            "env": "dev",
            "email": "user_a@example.com",
            "password": pw,
        },
    )
    token_a = login_a.json()["access_token"]

    env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={
            "project": project,
            "env": "dev",
            "email": "user_b@example.com",
            "password": pw,
        },
    )
    login_b = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={
            "project": project,
            "env": "dev",
            "email": "user_b@example.com",
            "password": pw,
        },
    )
    token_b = login_b.json()["access_token"]

    whoami_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers=jwt_headers(token_a, project),
    )
    whoami_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers=jwt_headers(token_b, project),
    )
    sub_a = get_rows(whoami_a.json())[0]["sub"]
    sub_b = get_rows(whoami_b.json())[0]["sub"]
    assert sub_a != sub_b

    insert_a = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"id": sub_a, "email": "user_a@example.com", "name": "User A"}
            },
        },
        headers=jwt_headers(token_a, project),
    )
    assert insert_a.status_code == 200

    insert_b = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"id": sub_b, "email": "user_b@example.com", "name": "User B"}
            },
        },
        headers=jwt_headers(token_b, project),
    )
    assert insert_b.status_code == 200

    select_all_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select"},
        headers=jwt_headers(token_a, project),
    )
    assert select_all_a.status_code == 200
    data_a = get_rows(select_all_a.json())
    assert len(data_a) == 1
    assert data_a[0]["id"] == sub_a

    select_b_by_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"id": sub_b}}},
        headers=jwt_headers(token_a, project),
    )
    assert select_b_by_a.status_code == 200
    assert len(get_rows(select_b_by_a.json())) == 0

    no_auth = env.httpToBridge(
        "POST", "/call", json={"path": "db/users/select", "params": {}}, headers={}
    )
    assert no_auth.status_code == 401
