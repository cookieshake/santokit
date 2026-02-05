from dsl import unique_project, write_schema

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


BASE_SCHEMA = """version: 1
tables:
  users:
    connection: main
    id:
      name: id
      generate: ulid
    columns:
      email:
        type: string
        nullable: false
        unique: true
      created_at:
        type: timestamp
        nullable: false
        default: now
"""

UPDATED_SCHEMA = """version: 1
tables:
  users:
    connection: main
    id:
      name: id
      generate: ulid
    columns:
      email:
        type: string
        nullable: false
        unique: true
      name:
        type: string
        nullable: true
      created_at:
        type: timestamp
        nullable: false
        default: now
"""


def test_flow_06_operator_schema_change(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("schema")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )

    write_schema("tests/integration_py/fixtures/basic", BASE_SCHEMA)
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref schema-1",
        workdir=FIXTURE_DIR,
    )

    write_schema("tests/integration_py/fixtures/basic", UPDATED_SCHEMA)
    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref schema-2",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0
