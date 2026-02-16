import pytest

from dsl import api_key_headers, create_api_key, get_rows, unique_project
from tests.helpers.assertions import assert_insert_row

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/expand_static"

pytestmark = [pytest.mark.domain("crud"), pytest.mark.capability("CRUD-003")]


def test_crud_expand(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("expand")
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )

    db_name = db_url.split("/")[-1]
    ddl = (
        "CREATE TABLE users (id text NOT NULL PRIMARY KEY, email text NOT NULL UNIQUE, name text, created_at timestamp NOT NULL DEFAULT now());"
        "CREATE TABLE posts (id text NOT NULL PRIMARY KEY, title text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE);"
    )
    db_container = env.docker_client.containers.get(env.db_container_id)
    exec_result = db_container.exec_run(
        ["/bin/sh", "-c", f'printf "{ddl}" | psql -U stk -d {db_name}']
    )
    assert exec_result.exit_code == 0, (
        f"Manual DDL failed: {exec_result.output.decode()}"
    )

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref expand-1", workdir=FIXTURE_DIR
    )

    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    insert_user = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"email": "user@expand.com", "name": "Expand User"}},
        },
        headers=headers,
    )
    assert insert_user.status_code == 200
    user_id = assert_insert_row(insert_user)["id"]

    insert_post = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/insert",
            "params": {"values": {"title": "My First Post", "user_id": user_id}},
        },
        headers=headers,
    )
    assert insert_post.status_code == 200
    post_id = assert_insert_row(insert_post)["id"]

    select_expand = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/select",
            "params": {"where": {"id": post_id}, "expand": ["user"]},
        },
        headers=headers,
    )
    assert select_expand.status_code == 200
    rows = get_rows(select_expand.json())
    assert len(rows) == 1
    assert rows[0]["title"] == "My First Post"
    assert rows[0]["user"]["email"] == "user@expand.com"

    select_normal = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/posts/select", "params": {"where": {"id": post_id}}},
        headers=headers,
    )
    assert select_normal.status_code == 200
    rows_norm = get_rows(select_normal.json())
    assert len(rows_norm) == 1
    assert "user" not in rows_norm[0]

    select_invalid = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/select",
            "params": {"where": {"id": post_id}, "expand": ["invalid_relation"]},
        },
        headers=headers,
    )
    assert select_invalid.status_code == 400
