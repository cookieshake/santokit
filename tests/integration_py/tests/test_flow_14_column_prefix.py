import pytest
import re
from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/column_prefix"

def test_flow_14_column_prefix(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("prefix")

    # 1. Setup
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref prefix-1",
        workdir=FIXTURE_DIR,
    )

    # API Key
    create = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name admin --roles admin",
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

    # 2. Insert Data (Initial)
    # We should NOT provide _system here, it should be allowed to be null/default.
    insert = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert", 
            "params": {
                "data": {
                    "normal": "norm",
                    "s_sensitive": "sens",
                    "c_secret": "crit",
                    "p_private": "priv"
                }
            }
        },
        headers=headers,
    )
    assert insert.status_code == 200
    user_id = insert.json()["data"]["ids"][0]

    # 3. Test SELECT * (Default Exclusions)
    select_all = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select"},
        headers=headers,
    )
    assert select_all.status_code == 200
    row = select_all.json()["data"]["data"][0]
    
    assert "normal" in row
    assert "s_sensitive" in row
    assert "c_secret" not in row
    assert "p_private" not in row
    assert "_system" not in row 
    
    # 4. Test Explicit SELECT (Allowed because permissions.yaml doesn't block it)
    select_explicit = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {
                "select": ["c_secret", "p_private", "_system"]
            }
        },
        headers=headers,
    )
    assert select_explicit.status_code == 200
    row_explicit = select_explicit.json()["data"]["data"][0]
    assert row_explicit["c_secret"] == "crit"
    assert row_explicit["p_private"] == "priv"
    # _system is null but key should exist
    assert "_system" in row_explicit

    # 5. Test WRITE to System Column (Should fail)
    # Insert with _system
    insert_fail = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert", 
            "params": {
                "data": {
                    "_system": "hack"
                }
            }
        },
        headers=headers,
    )
    assert insert_fail.status_code == 400
    # Expected error message about read-only system column
    assert "system column" in insert_fail.text

    # Update with _system
    update_fail = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/update", 
            "params": {
                "where": {"id": user_id},
                "data": {
                    "_system": "hack"
                }
            }
        },
        headers=headers,
    )
    assert update_fail.status_code == 400
    assert "system column" in update_fail.text
