import re

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_flow_02_operator_apikey(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("apikey")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref apikey-1",
        workdir=FIXTURE_DIR,
    )

    create = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name server --roles admin",
        workdir=FIXTURE_DIR,
    )
    assert create.exit_code == 0
    match = re.search(r"Key ID: (\S+)", create.output)
    assert match
    key_id = match.group(1)

    listed = env.runStkCli(
        f"stk apikey list --project {project} --env dev",
        workdir=FIXTURE_DIR,
    )
    assert listed.exit_code == 0
    assert key_id in listed.output

    revoked = env.runStkCli(
        f"stk apikey revoke --project {project} --env dev --key-id {key_id}",
        workdir=FIXTURE_DIR,
    )
    assert revoked.exit_code == 0
