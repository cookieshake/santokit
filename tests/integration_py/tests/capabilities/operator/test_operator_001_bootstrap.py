import pytest

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("operator"), pytest.mark.capability("OPERATOR-001")]


def test_operator_bootstrap(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("bootstrap")
    result = env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    assert result.exit_code == 0

    for name in ["dev", "prod"]:
        result = env.runStkCli(
            f"stk env create --project {project} {name}", workdir=FIXTURE_DIR
        )
        assert result.exit_code == 0

    db_url = env.ensure_project_db(project)
    result = env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0

    result = env.runStkCli(
        f"stk connections test --project {project} --env dev --name main",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0

    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref bootstrap-1",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0
