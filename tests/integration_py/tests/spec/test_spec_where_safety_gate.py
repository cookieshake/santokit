import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.spec("where_safety")]


def test_spec_update_delete_require_non_empty_where(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "specwhere", "spec-where-1")

    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    no_where_update = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {"data": {"email": "x@example.com"}},
        },
        headers=headers,
    )
    assert no_where_update.status_code == 400

    empty_where_delete = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/delete", "params": {"where": {}}},
        headers=headers,
    )
    assert empty_where_delete.status_code == 400
