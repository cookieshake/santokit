import re
from dsl import unique_project, bootstrap_project, create_api_key, api_key_headers, get_rows

FIXTURE_DIR_BASIC = "/workspace/tests/integration_py/fixtures/basic"
FIXTURE_DIR_EXPAND = "/workspace/tests/integration_py/fixtures/expand_static"


def test_crud_basic(compose_env):
    """Flow 05: Basic CRUD insert/select"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_BASIC, "crud", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR_BASIC)
    headers = api_key_headers(api_key, project)

    insert = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "a@b.com"}}},
        headers=headers,
    )
    assert insert.status_code == 200

    select = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"email": "a@b.com"}}},
        headers=headers,
    )
    assert select.status_code == 200


def test_crud_advanced(compose_env):
    """Flow 10: Advanced CRUD (update/delete edge cases)"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_BASIC, "crud_adv", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR_BASIC)
    headers = api_key_headers(api_key, project)

    insert = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "test@example.com"}}},
        headers=headers,
    )
    assert insert.status_code == 200
    data = insert.json().get("data", {})
    if isinstance(data, dict) and "generated_id" in data:
        user_id = data["generated_id"]
    elif isinstance(data, list):
        user_id = data[0]["id"]
    else:
        user_id = data["ids"][0] if "ids" in data else data["id"]

    update = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/update", "params": {"data": {"email": "updated@example.com"}, "where": {"id": user_id}}},
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


def test_crud_expand(compose_env):
    """Flow 11: FK join expand functionality"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("expand")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR_EXPAND)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR_EXPAND)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR_EXPAND,
    )

    db_name = db_url.split("/")[-1]
    ddl = """
    CREATE TABLE users (
        id text NOT NULL PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text,
        created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE posts (
        id text NOT NULL PRIMARY KEY,
        title text NOT NULL,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    """

    db_container = env.docker_client.containers.get(env.db_container_id)
    exec_result = db_container.exec_run(
        ["/bin/sh", "-c", f"printf \"{ddl}\" | psql -U stk -d {db_name}"],
    )
    assert exec_result.exit_code == 0, f"Manual DDL failed: {exec_result.output.decode()}"

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref expand-1",
        workdir=FIXTURE_DIR_EXPAND,
    )

    api_key = create_api_key(env, project, FIXTURE_DIR_EXPAND)
    headers = api_key_headers(api_key, project)

    insert_user = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"email": "user@expand.com", "name": "Expand User"}}
        },
        headers=headers,
    )
    assert insert_user.status_code == 200, f"Insert user failed: {insert_user.text}"
    user_data = insert_user.json().get("data")
    if isinstance(user_data, dict) and "generated_id" in user_data:
        user_id = user_data["generated_id"]
    elif isinstance(user_data, list):
        user_id = user_data[0]["id"]
    else:
        user_id = user_data["ids"][0] if "ids" in user_data else user_data["id"]

    insert_post = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/insert",
            "params": {"values": {"title": "My First Post", "user_id": user_id}}
        },
        headers=headers,
    )
    assert insert_post.status_code == 200, f"Insert post failed: {insert_post.text}"
    post_data = insert_post.json().get("data")
    if isinstance(post_data, dict) and "generated_id" in post_data:
        post_id = post_data["generated_id"]
    elif isinstance(post_data, list):
        post_id = post_data[0]["id"]
    else:
        post_id = post_data["ids"][0] if "ids" in post_data else post_data["id"]

    select_expand = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/select",
            "params": {
                "where": {"id": post_id},
                "expand": ["user"]
            }
        },
        headers=headers,
    )
    assert select_expand.status_code == 200, f"Select expand failed: {select_expand.text}"

    rows = get_rows(select_expand.json())
    assert len(rows) == 1
    post_row = rows[0]
    assert post_row["title"] == "My First Post"
    assert "user" in post_row, "Expanded 'user' field missing"
    assert post_row["user"]["email"] == "user@expand.com"
    assert post_row["user"]["id"] == user_id

    select_normal = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/select",
            "params": {
                "where": {"id": post_id}
            }
        },
        headers=headers,
    )
    assert select_normal.status_code == 200
    rows_norm = get_rows(select_normal.json())
    assert len(rows_norm) == 1
    assert "user_id" in rows_norm[0]
    assert "user" not in rows_norm[0], "Unexpected 'user' field in normal select"

    select_invalid = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/posts/select",
            "params": {
                "where": {"id": post_id},
                "expand": ["invalid_relation"]
            }
        },
        headers=headers,
    )
    assert select_invalid.status_code >= 400, "Should fail with invalid expand relation"


def test_crud_pagination_sorting(compose_env):
    """Flow 12: Pagination and sorting with orderBy"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR_BASIC, "page", "crud-1")
    api_key = create_api_key(env, project, FIXTURE_DIR_BASIC)
    headers = api_key_headers(api_key, project)

    for i in range(5):
        env.httpToBridge(
            "POST",
            "/call",
            json={"path": "db/users/insert", "params": {"values": {"email": f"user{i}@example.com"}}},
            headers=headers,
        )

    select_page = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 2, "offset": 0}},
        headers=headers,
    )
    assert select_page.status_code == 200
    rows = get_rows(select_page.json())
    assert len(rows) == 2

    select_sorted = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"orderBy": [{"field": "email", "direction": "asc"}], "limit": 5}},
        headers=headers,
    )
    assert select_sorted.status_code == 200
    rows_sorted = get_rows(select_sorted.json())
    assert len(rows_sorted) == 5
    assert rows_sorted[0]["email"] == "user0@example.com"
