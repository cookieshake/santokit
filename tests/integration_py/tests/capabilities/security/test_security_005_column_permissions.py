import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/column_permissions"

pytestmark = [pytest.mark.domain("security"), pytest.mark.capability("SECURITY-005")]


def test_column_permissions(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "colperms", "colperms-1")
    admin_key = create_api_key(env, project, FIXTURE_DIR, name="admin", roles="admin")
    basic_key = create_api_key(env, project, FIXTURE_DIR, name="basic", roles="basic")

    admin_headers = api_key_headers(admin_key, project)
    basic_headers = api_key_headers(basic_key, project)

    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"email": "test@col.com", "name": "Test User"}},
        },
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

    bad_insert = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"name": "Basic", "email": "basic@x.com"}},
        },
        headers=basic_headers,
    )
    assert bad_insert.status_code == 400
