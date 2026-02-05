from dsl import unique_project, write_permissions

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

BASE_PERMS = """tables:
  users:
    select:
      roles: [admin]
    insert:
      roles: [admin]
    update:
      roles: [admin]
    delete:
      roles: [admin]
"""

UPDATED_PERMS = """tables:
  users:
    select:
      roles: [admin, reader]
    insert:
      roles: [admin]
    update:
      roles: [admin]
    delete:
      roles: [admin]
"""


def test_flow_07_operator_permissions_change(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("perms")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )

    write_permissions("tests/integration_py/fixtures/basic", BASE_PERMS)
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref perms-1",
        workdir=FIXTURE_DIR,
    )

    write_permissions("tests/integration_py/fixtures/basic", UPDATED_PERMS)
    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref perms-2",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0
