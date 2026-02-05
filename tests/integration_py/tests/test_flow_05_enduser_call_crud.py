import re

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_flow_05_enduser_call_crud(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("crud")

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

    insert = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "a@b.com"}}},
        headers={
            "X-Santokit-Api-Key": api_key,
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert insert.status_code == 200

    select = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"email": "a@b.com"}}},
        headers={
            "X-Santokit-Api-Key": api_key,
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert select.status_code == 200
