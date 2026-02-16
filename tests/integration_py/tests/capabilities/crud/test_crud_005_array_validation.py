import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key
from tests.helpers.assertions import assert_insert_row

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/array_validation"

pytestmark = [pytest.mark.domain("crud"), pytest.mark.capability("CRUD-005")]


def test_crud_array_validation(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "arr", "array-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    insert_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "values": {
                    "email": "array-ok@example.com",
                    "tags": ["a", "b"],
                    "scores": [1, 2, 3],
                }
            },
        },
        headers=headers,
    )
    assert insert_ok.status_code == 200
    user_id = assert_insert_row(insert_ok)["id"]

    insert_bad = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "values": {
                    "email": "array-bad@example.com",
                    "tags": ["ok", 1],
                    "scores": [1, 2],
                }
            },
        },
        headers=headers,
    )
    assert insert_bad.status_code == 400

    update_bad = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {"where": {"id": user_id}, "data": {"scores": ["oops"]}},
        },
        headers=headers,
    )
    assert update_bad.status_code == 400

    non_array = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "values": {
                    "email": "array-nonarray@example.com",
                    "tags": "not-array",
                    "scores": [1],
                }
            },
        },
        headers=headers,
    )
    assert non_array.status_code == 400
