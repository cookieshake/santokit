import re
from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/expand_static"

def test_flow_11_crud_expand(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("expand")

    # Setup
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    
    # Apply Schema (Users + Posts)
    # WORKAROUND: stk apply fails with multiple statements. Manually create tables first.
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
    
    # We need to execute this DDL. dsl doesn't expose raw exec on DB easily, but we can access docker client.
    # compose_env is the SantokitDsl instance.
    db_container = env.docker_client.containers.get(env.db_container_id)
    # psql might fail if we pass multiline string directly in -c? 
    # Use printf pipe to psql.
    exec_result = db_container.exec_run(
        ["/bin/sh", "-c", f"printf \"{ddl}\" | psql -U stk -d {db_name}"],
    )
    assert exec_result.exit_code == 0, f"Manual DDL failed: {exec_result.output.decode()}"

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref expand-1",
        workdir=FIXTURE_DIR,
    )

    create = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name server --roles admin",
        workdir=FIXTURE_DIR,
    )
    match = re.search(r"API Key \(store securely\): (\S+)", create.output)
    assert match
    api_key = match.group(1)
    
    headers = {
        "X-Santokit-Api-Key": api_key,
        "X-Santokit-Project": project,
        "X-Santokit-Env": "dev",
    }


    # 1. Insert User
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
        # Fallback for some implementations
        user_id = user_data["ids"][0] if "ids" in user_data else user_data["id"]

    # 2. Insert Post linked to User
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

    # 3. Select with Expand
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
    
    res_data = select_expand.json().get("data", {})
    rows = res_data.get("data", []) if isinstance(res_data, dict) else res_data
    
    assert len(rows) == 1
    post_row = rows[0]
    assert post_row["title"] == "My First Post"
    assert "user" in post_row, "Expanded 'user' field missing"
    assert post_row["user"]["email"] == "user@expand.com"
    assert post_row["user"]["id"] == user_id

    # 4. Select without Expand (Control)
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
    res_data_norm = select_normal.json().get("data", {})
    rows_norm = res_data_norm.get("data", []) if isinstance(res_data_norm, dict) else res_data_norm
    
    assert len(rows_norm) == 1
    assert "user_id" in rows_norm[0]
    assert "user" not in rows_norm[0], "Unexpected 'user' field in normal select"

    # 5. Invalid Expand
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
