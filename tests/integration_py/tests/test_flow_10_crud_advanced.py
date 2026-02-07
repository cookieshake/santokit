import re
from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

def test_flow_10_crud_advanced(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("crud_adv")

    # Setup
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref crud-1",
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

    # 1. Insert Data
    insert = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert", 
            "params": {"values": {"email": "update@test.com", "name": "Before Update"}}
        },
        headers=headers,
    )
    assert insert.status_code == 200, f"Insert failed: {insert.text}"
    
    # Check if 'data' is a list (standard for insert returning multiple/single rows) or object
    resp_data = insert.json().get("data")
    if isinstance(resp_data, dict) and "generated_id" in resp_data:
        user_id = resp_data["generated_id"]
    elif isinstance(resp_data, list) and len(resp_data) > 0 and "id" in resp_data[0]:
         user_id = resp_data[0]["id"]
    else:
        raise ValueError(f"Unexpected data format: {resp_data}")

    # 2. Update Test
    # Normal update
    update = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"name": "After Update"}
            }
        },
        headers=headers,
    )
    assert update.status_code == 200, f"Update failed: {update.text}"
    # Depending on implementation, update might return the updated row or count.
    # We verify with select below.

    # Verify with select
    select = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {"where": {"id": user_id}}
        },
        headers=headers,
    )
    assert select.status_code == 200
    
    select_data = select.json().get("data", {})
    # Check for nested 'data' field (common in paginated responses)
    rows = select_data.get("data", []) if isinstance(select_data, dict) else select_data
    
    assert len(rows) > 0, f"Select returned no data: {select.text}"
    assert rows[0]["name"] == "After Update"

    # Update with empty where -> Should fail (Safety check)
    update_empty_where = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {}, # Empty where
                "data": {"name": "Should Fail"}
            }
        },
        headers=headers,
    )
    assert update_empty_where.status_code >= 400, "Update with empty where should fail"

    # Update non-existent column -> Should fail
    update_bad_col = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"invalid_col": "Should Fail"}
            }
        },
        headers=headers,
    )
    assert update_bad_col.status_code >= 400, "Update non-existent column should fail"

    # 3. Delete Test
    # Delete with empty where -> Should fail (Safety check)
    delete_empty_where = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/delete",
            "params": {
                "where": {}
            }
        },
        headers=headers,
    )
    assert delete_empty_where.status_code >= 400, "Delete with empty where should fail"

    # Normal delete
    delete = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/delete",
            "params": {
                "where": {"id": user_id}
            }
        },
        headers=headers,
    )
    assert delete.status_code == 200, f"Delete failed: {delete.text}"

    # Verify deletion
    select_deleted = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {"where": {"id": user_id}}
        },
        headers=headers,
    )
    assert select_deleted.status_code == 200
    
    deleted_data = select_deleted.json().get("data", {})
    deleted_rows = deleted_data.get("data", []) if isinstance(deleted_data, dict) else deleted_data
    
    assert len(deleted_rows) == 0, f"Delete failed, record still exists: {select_deleted.text}"
