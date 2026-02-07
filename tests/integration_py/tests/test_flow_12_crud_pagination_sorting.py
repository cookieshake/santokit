import re
from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

def test_flow_12_crud_pagination_sorting(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("pagination")

    # Setup
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref initial",
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

    # 2. Insert Data (5 users: A, B, C, D, E)
    names = ["User A", "User B", "User C", "User D", "User E"]
    for name in names:
        email = f"{name.replace(' ', '').lower()}@example.com"
        env.httpToBridge(
            "POST",
            "/call",
            json={
                "path": "db/users/insert", 
                "params": {"values": {"email": email, "name": name}}
            },
            headers=headers,
        ).raise_for_status()

    # 3. Sort Ascending
    sort_asc = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {"orderBy": {"name": "asc"}}
        },
        headers=headers,
    )
    assert sort_asc.status_code == 200
    rows_asc = get_rows(sort_asc.json())
    assert len(rows_asc) == 5
    assert [r["name"] for r in rows_asc] == names

    # 4. Sort Descending
    sort_desc = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {"orderBy": {"name": "desc"}}
        },
        headers=headers,
    )
    assert sort_desc.status_code == 200
    rows_desc = get_rows(sort_desc.json())
    assert len(rows_desc) == 5
    assert [r["name"] for r in rows_desc] == sorted(names, reverse=True)

    # 5. Limit
    limit_req = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {
                "orderBy": {"name": "asc"},
                "limit": 2
            }
        },
        headers=headers,
    )
    assert limit_req.status_code == 200
    rows_limit = get_rows(limit_req.json())
    assert len(rows_limit) == 2
    assert [r["name"] for r in rows_limit] == ["User A", "User B"]

    # 6. Offset (Skip 2)
    offset_req = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {
                "orderBy": {"name": "asc"},
                "limit": 2,
                "offset": 2
            }
        },
        headers=headers,
    )
    assert offset_req.status_code == 200
    rows_offset = get_rows(offset_req.json())
    assert len(rows_offset) == 2
    assert [r["name"] for r in rows_offset] == ["User C", "User D"]

    # 7. Pagination Loop Check (Offset 4)
    offset_req2 = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/select",
            "params": {
                "orderBy": {"name": "asc"},
                "limit": 2,
                "offset": 4
            }
        },
        headers=headers,
    )
    assert offset_req2.status_code == 200
    rows_offset2 = get_rows(offset_req2.json())
    assert len(rows_offset2) == 1
    assert [r["name"] for r in rows_offset2] == ["User E"]


def get_rows(response_json):
    data = response_json.get("data", {})
    if isinstance(data, dict):
        return data.get("data", [])
    return data
