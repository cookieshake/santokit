import re
from dsl import bootstrap_project, create_api_key, api_key_headers, signup_and_login, jwt_headers, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"


def test_logics_whoami(compose_env):
    """B1: whoami logic returns authenticated user's sub"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b1")

    # Create end user and login
    email = "user@example.com"
    password = "password123"
    token = signup_and_login(env, project, email, password)
    headers = jwt_headers(token, project)

    # Call whoami logic
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify sub is returned
    data = resp.json()["data"]
    rows = get_rows({"data": data})
    assert len(rows) == 1
    assert "sub" in rows[0]
    assert rows[0]["sub"]  # sub should not be empty


def test_logics_public_hello(compose_env):
    """B2: public_hello logic returns greeting without authentication"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b2")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    # Call public_hello logic
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/public_hello"},
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify greeting
    rows = get_rows(resp.json())
    assert len(rows) == 1
    assert rows[0]["greeting"] == "hello"


def test_logics_insert_item(compose_env):
    """B3: insert_item logic inserts into items table"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b3")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    # Insert item via logic
    item_id = "item-001"
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/insert_item",
            "params": {
                "id": item_id,
                "name": "Test Item",
                "price": 1000,
                "owner_id": "owner-123",
            },
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["affected"] == 1

    # Verify via CRUD select - just check that the item was inserted
    select_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/items/select"},
        headers=headers,
    )
    assert select_resp.status_code == 200
    rows = get_rows(select_resp.json())
    assert len(rows) == 1
    assert rows[0]["id"] == item_id
    assert rows[0]["name"] == "Test Item"


def test_logics_get_items(compose_env):
    """B4: get_items logic filters by owner_id parameter"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b4")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    # Query with non-existent owner - should return empty
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/get_items",
            "params": {"owner_id": "nobody"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    rows = get_rows(resp.json())
    assert len(rows) == 0

    # Insert an item
    owner_id = "owner-456"
    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/insert_item",
            "params": {
                "id": "item-002",
                "name": "Owned Item",
                "price": 2000,
                "owner_id": owner_id,
            },
        },
        headers=headers,
    )
    assert insert_resp.status_code == 200

    # Query again with correct owner_id - should return 1 item
    resp2 = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/get_items",
            "params": {"owner_id": owner_id},
        },
        headers=headers,
    )
    assert resp2.status_code == 200
    rows2 = get_rows(resp2.json())
    assert len(rows2) == 1
    assert rows2[0]["owner_id"] == owner_id


def test_logics_default_params(compose_env):
    """B5: default_params logic uses default values when params not provided"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b5")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    # Call 1: no params - should use defaults
    resp1 = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/default_params"},
        headers=headers,
    )
    assert resp1.status_code == 200
    rows1 = get_rows(resp1.json())
    assert len(rows1) == 1
    assert rows1[0]["greeting"] == "world"
    assert rows1[0]["count"] == 1

    # Call 2: partial override (greeting only)
    resp2 = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/default_params",
            "params": {"greeting": "hi"},
        },
        headers=headers,
    )
    assert resp2.status_code == 200
    rows2 = get_rows(resp2.json())
    assert len(rows2) == 1
    assert rows2[0]["greeting"] == "hi"
    assert rows2[0]["count"] == 1

    # Call 3: full override
    resp3 = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/default_params",
            "params": {"greeting": "hi", "count": 5},
        },
        headers=headers,
    )
    assert resp3.status_code == 200
    rows3 = get_rows(resp3.json())
    assert len(rows3) == 1
    assert rows3[0]["greeting"] == "hi"
    assert rows3[0]["count"] == 5


def test_logics_admin_only(compose_env):
    """B6: admin_only logic requires admin role"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b6")

    # Create API key with admin role
    api_key = create_api_key(env, project, FIXTURE_DIR, name="admin-key", roles="admin")
    admin_headers = api_key_headers(api_key, project)

    # Create end user (role: user)
    email = "user@example.com"
    password = "password123"
    token = signup_and_login(env, project, email, password)
    user_headers = jwt_headers(token, project)

    # End user should get 403
    user_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/admin_only"},
        headers=user_headers,
    )
    assert user_resp.status_code == 403

    # Admin should succeed
    admin_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/admin_only"},
        headers=admin_headers,
    )
    assert admin_resp.status_code == 200
    rows = get_rows(admin_resp.json())
    assert len(rows) == 1
    assert "total" in rows[0]


def test_logics_error_cases(compose_env):
    """B7: Various error scenarios for custom logics"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b7")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    # Error 1: Missing required parameter - should return 400
    resp_missing = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/get_items"},
        headers=headers,
    )
    assert resp_missing.status_code == 400

    # Error 2: Non-existent logic - should return 404
    resp_not_found = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/nonexistent"},
        headers=headers,
    )
    assert resp_not_found.status_code == 404

    # Error 3: Unauthenticated call to authenticated logic - should return 401
    resp_unauth = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers={},
    )
    assert resp_unauth.status_code == 401

    # Error 4: Invalid parameter type - should return 400
    resp_invalid_type = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/get_items",
            "params": {"owner_id": 12345},  # int instead of string
        },
        headers=headers,
    )
    assert resp_invalid_type.status_code == 400
