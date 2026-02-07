import pytest
import re
from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/cel_condition"

def test_flow_13_cel_condition(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("cel")

    # 1. Setup project
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref cel-1",
        workdir=FIXTURE_DIR,
    )

    # 2. Signup & Login User A
    email_a = "user_a@example.com"
    pw = "password123"
    signup_a = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={"project": project, "env": "dev", "email": email_a, "password": pw},
    )
    assert signup_a.status_code == 200

    login_a = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project, "env": "dev", "email": email_a, "password": pw},
    )
    assert login_a.status_code == 200
    token_a = login_a.json()["access_token"]
    
    # Get sub_a using 'whoami' logic
    whoami_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert whoami_a.status_code == 200
    sub_a = whoami_a.json()["data"]["data"][0]["sub"]

    # 3. Signup & Login User B
    email_b = "user_b@example.com"
    signup_b = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={"project": project, "env": "dev", "email": email_b, "password": pw},
    )
    assert signup_b.status_code == 200

    login_b = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project, "env": "dev", "email": email_b, "password": pw},
    )
    assert login_b.status_code == 200
    token_b = login_b.json()["access_token"]
    
    # Get sub_b using 'whoami' logic
    whoami_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/whoami"},
        headers={
            "Authorization": f"Bearer {token_b}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert whoami_b.status_code == 200
    sub_b = whoami_b.json()["data"]["data"][0]["sub"]
    
    assert sub_a != sub_b

    # 4. Insert records
    # User A inserts their record
    insert_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"data": {"id": sub_a, "email": email_a, "name": "User A"}}},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert insert_a.status_code == 200
    
    # User B inserts their record
    insert_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"data": {"id": sub_b, "email": email_b, "name": "User B"}}},
        headers={
            "Authorization": f"Bearer {token_b}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert insert_b.status_code == 200

    # 5. Verify WHERE injection (Select)
    
    # User A selects ALL
    select_all_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select"},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    if select_all_a.status_code != 200:
        print(f"DEBUG: select_all_a failed with {select_all_a.status_code}: {select_all_a.text}")
    assert select_all_a.status_code == 200
    data_a = select_all_a.json()["data"]["data"]
    assert len(data_a) == 1
    assert data_a[0]["id"] == sub_a
    
    # User A tries to select User B's record specifically
    select_b_by_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"id": sub_b}}},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert select_b_by_a.status_code == 200
    data_b_by_a = select_b_by_a.json()["data"]["data"]
    assert len(data_b_by_a) == 0 # Should be empty because of injected 'id = sub_a'

    # 6. Verify WHERE injection (Update)
    
    # User A tries to update User B's record
    update_b_by_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/update", "params": {"data": {"name": "Hacked"}, "where": {"id": sub_b}}},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert update_b_by_a.status_code == 200
    assert len(update_b_by_a.json()["data"]["ids"]) == 0 # No rows updated
    
    # Verify User B's record is still the same
    select_b_by_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {}},
        headers={
            "Authorization": f"Bearer {token_b}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert select_b_by_b.status_code == 200
    assert select_b_by_b.json()["data"]["data"][0]["name"] == "User B"