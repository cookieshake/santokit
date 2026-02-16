import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key
from tests.helpers.assertions import assert_affected, assert_insert_row

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("crud"), pytest.mark.capability("CRUD-002")]


def test_crud_advanced(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "crud_adv", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    insert = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"email": "test@example.com"}},
        },
        headers=headers,
    )
    assert insert.status_code == 200
    user_id = assert_insert_row(insert)["id"]

    update = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {
                "data": {"email": "updated@example.com"},
                "where": {"id": user_id},
            },
        },
        headers=headers,
    )
    assert update.status_code == 200

    delete = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/delete", "params": {"where": {"id": user_id}}},
        headers=headers,
    )
    assert delete.status_code == 200
    assert_affected(delete)

    missing_where = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {"data": {"email": "bad@example.com"}},
        },
        headers=headers,
    )
    assert missing_where.status_code == 400
