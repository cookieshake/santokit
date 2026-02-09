import re
from dsl import unique_project, bootstrap_project, signup_and_login, jwt_headers, create_api_key, api_key_headers, get_rows

FIXTURE_DIR_CEL = "/workspace/tests/integration_py/fixtures/cel_condition"
FIXTURE_DIR_PREFIX = "/workspace/tests/integration_py/fixtures/column_prefix"
FIXTURE_DIR_COL_PERMS = "/workspace/tests/integration_py/fixtures/column_permissions"


def test_cel_condition(compose_env):
    """Flow 13: CEL row-level security with condition injection"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_CEL, "cel", "cel-1")

    email_a = "user_a@example.com"
    pw = "password123"
    signup_a = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={"project": project, "env": "dev", "email": email_a, "password": pw},
    )
    assert signup_a.status_code == 200

    login_a = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project, "env": "dev", "email": email_a, "password": pw},
    )
    assert login_a.status_code == 200
    token_a = login_a.json()["access_token"]

    whoami_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers=jwt_headers(token_a, project),
    )
    assert whoami_a.status_code == 200
    sub_a = whoami_a.json()["data"]["data"][0]["sub"]

    email_b = "user_b@example.com"
    signup_b = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={"project": project, "env": "dev", "email": email_b, "password": pw},
    )
    assert signup_b.status_code == 200

    login_b = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project, "env": "dev", "email": email_b, "password": pw},
    )
    assert login_b.status_code == 200
    token_b = login_b.json()["access_token"]

    whoami_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers=jwt_headers(token_b, project),
    )
    assert whoami_b.status_code == 200
    sub_b = whoami_b.json()["data"]["data"][0]["sub"]

    assert sub_a != sub_b

    insert_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"data": {"id": sub_a, "email": email_a, "name": "User A"}}},
        headers=jwt_headers(token_a, project),
    )
    assert insert_a.status_code == 200

    insert_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"data": {"id": sub_b, "email": email_b, "name": "User B"}}},
        headers=jwt_headers(token_b, project),
    )
    assert insert_b.status_code == 200

    select_all_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select"},
        headers=jwt_headers(token_a, project),
    )
    if select_all_a.status_code != 200:
        print(f"DEBUG: select_all_a failed with {select_all_a.status_code}: {select_all_a.text}")
    assert select_all_a.status_code == 200
    data_a = select_all_a.json()["data"]["data"]
    assert len(data_a) == 1
    assert data_a[0]["id"] == sub_a

    select_b_by_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"id": sub_b}}},
        headers=jwt_headers(token_a, project),
    )
    assert select_b_by_a.status_code == 200
    data_b_by_a = select_b_by_a.json()["data"]["data"]
    assert len(data_b_by_a) == 0

    update_b_by_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/update", "params": {"data": {"name": "Hacked"}, "where": {"id": sub_b}}},
        headers=jwt_headers(token_a, project),
    )
    assert update_b_by_a.status_code == 200
    assert len(update_b_by_a.json()["data"]["ids"]) == 0

    select_b_by_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {}},
        headers=jwt_headers(token_b, project),
    )
    assert select_b_by_b.status_code == 200
    assert select_b_by_b.json()["data"]["data"][0]["name"] == "User B"


def test_column_prefix(compose_env):
    """Flow 14: Column prefix data masking"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_PREFIX, "prefix", "prefix-1")

    admin_key = create_api_key(env, project, FIXTURE_DIR_PREFIX, name="admin", roles="admin")
    viewer_key = create_api_key(env, project, FIXTURE_DIR_PREFIX, name="viewer", roles="viewer")

    admin_headers = api_key_headers(admin_key, project)
    viewer_headers = api_key_headers(viewer_key, project)

    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"normal": "John Doe", "s_sensitive": "s1"}}},
        headers=admin_headers,
    )
    assert insert_resp.status_code == 200

    select_admin = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"normal": "John Doe"}}},
        headers=admin_headers,
    )
    assert select_admin.status_code == 200
    rows_admin = get_rows(select_admin.json())
    assert len(rows_admin) == 1

    select_viewer = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"normal": "John Doe"}}},
        headers=viewer_headers,
    )
    assert select_viewer.status_code == 200
    rows_viewer = get_rows(select_viewer.json())
    assert len(rows_viewer) == 1
    assert "normal" in rows_viewer[0]
    assert "s_sensitive" in rows_viewer[0]
    assert "c_secret" not in rows_viewer[0]
    assert "p_private" not in rows_viewer[0]
    assert "_system" not in rows_viewer[0]


def test_column_permissions(compose_env):
    """Flow 16: Column-level permissions"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_COL_PERMS, "colperms", "colperms-1")

    admin_key = create_api_key(env, project, FIXTURE_DIR_COL_PERMS, name="admin", roles="admin")
    basic_key = create_api_key(env, project, FIXTURE_DIR_COL_PERMS, name="basic", roles="basic")

    admin_headers = api_key_headers(admin_key, project)
    basic_headers = api_key_headers(basic_key, project)

    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "test@col.com", "name": "Test User"}}},
        headers=admin_headers,
    )
    assert insert_resp.status_code == 200

    select_admin = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {}},
        headers=admin_headers,
    )
    assert select_admin.status_code == 200
    rows_admin = get_rows(select_admin.json())
    assert len(rows_admin) >= 1
    assert "email" in rows_admin[0]
    assert "name" in rows_admin[0]

    select_basic = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {}},
        headers=basic_headers,
    )
    assert select_basic.status_code == 200
    rows_basic = get_rows(select_basic.json())
    assert len(rows_basic) >= 1
    assert "email" not in rows_basic[0]
    assert "name" in rows_basic[0]
