import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("operator"), pytest.mark.capability("OPERATOR-003")]


def test_operator_schema_change(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "schema", "schema-1")
    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref schema-2",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0
