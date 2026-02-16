import pytest

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("operator"), pytest.mark.capability("OPERATOR-005")]


def test_operator_release_promotion_rollback(compose_env):
    env = compose_env
    token = env.login_operator("owner@example.com", "password")

    project = unique_project("release")
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} prod", workdir=FIXTURE_DIR)

    db_url_dev = env.ensure_project_db(f"{project}_dev")
    db_url_prod = env.ensure_project_db(f"{project}_prod")
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url_dev}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk connections set --project {project} --env prod --name main --engine postgres --db-url {db_url_prod}",
        workdir=FIXTURE_DIR,
    )

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref release-1", workdir=FIXTURE_DIR
    )
    env.runStkCli(
        f"stk schema snapshot --project {project} --env prod", workdir=FIXTURE_DIR
    )

    promote = env.runStkCli(
        f"stk release promote --project {project} --from dev --to prod",
        workdir=FIXTURE_DIR,
    )
    assert promote.exit_code == 0

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref release-2", workdir=FIXTURE_DIR
    )

    list_resp = env.httpToHub(
        "GET",
        f"/api/releases?project={project}&env=dev&limit=2",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_resp.status_code == 200
    releases = list_resp.json()
    assert len(releases) >= 1
    previous_release_id = releases[-1]["id"]

    rollback_resp = env.httpToHub(
        "POST",
        "/api/releases/rollback",
        json={"project": project, "env": "prod", "to_release_id": previous_release_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert rollback_resp.status_code == 200
