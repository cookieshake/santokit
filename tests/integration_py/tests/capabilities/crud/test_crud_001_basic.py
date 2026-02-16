import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key
from tests.helpers.assertions import assert_insert_row

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("crud"), pytest.mark.capability("CRUD-001")]


def test_crud_basic(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "crud", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    insert = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "a@b.com"}}},
        headers=headers,
    )
    assert insert.status_code == 200
    inserted = assert_insert_row(insert)
    assert inserted["email"] == "a@b.com"

    insert_with_forced_id = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"id": "manual_id", "email": "b@b.com"}},
        },
        headers=headers,
    )
    assert insert_with_forced_id.status_code == 400

    select = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"email": "a@b.com"}}},
        headers=headers,
    )
    assert select.status_code == 200
