import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("crud"), pytest.mark.capability("CRUD-004")]


def test_crud_pagination_sorting(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "page", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    for i in range(5):
        env.httpToBridge(
            "POST",
            "/call",
            json={
                "path": "db/users/insert",
                "params": {"values": {"email": f"user{i}@example.com"}},
            },
            headers=headers,
        )

    select_page = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 2, "offset": 0}},
        headers=headers,
    )
    assert select_page.status_code == 200
    assert len(get_rows(select_page.json())) == 2

    select_sorted = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {"orderBy": {"email": "asc"}, "limit": 5},
        },
        headers=headers,
    )
    assert select_sorted.status_code == 200
    rows_sorted = get_rows(select_sorted.json())
    assert len(rows_sorted) == 5
    assert rows_sorted[0]["email"] == "user0@example.com"

    invalid_direction = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"orderBy": {"email": "up"}}},
        headers=headers,
    )
    assert invalid_direction.status_code == 400

    negative_limit = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": -1}},
        headers=headers,
    )
    assert negative_limit.status_code == 400
