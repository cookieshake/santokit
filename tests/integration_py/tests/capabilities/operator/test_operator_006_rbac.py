import pytest

from dsl import bootstrap_project, unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("operator"), pytest.mark.capability("OPERATOR-006")]


def test_operator_rbac_membership_and_roles(compose_env):
    env = compose_env
    owner_token = env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "rbac", "rbac-r1")

    org_user = f"org_{unique_project('user')}@example.com"
    project_user = f"proj_{unique_project('user')}@example.com"

    org_invite = env.runStkCli(
        f"stk org invite {org_user} --role member",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert org_invite.exit_code == 0

    org_set_role = env.runStkCli(
        f"stk org members set-role {org_user} --role admin",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert org_set_role.exit_code == 0

    org_remove = env.runStkCli(
        f"stk org remove {org_user}",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert org_remove.exit_code == 0

    proj_invite = env.runStkCli(
        f"stk project invite {project_user} --project {project} --role viewer",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert proj_invite.exit_code == 0

    viewer_login = env.httpToHub(
        "POST",
        "/api/auth/login",
        json={"email": project_user, "password": "password"},
    )
    assert viewer_login.status_code == 200
    viewer_token = viewer_login.json()["token"]

    denied = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name denied --roles admin",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": viewer_token},
        check=False,
    )
    assert denied.exit_code != 0
    assert "403" in denied.output

    promote_role = env.runStkCli(
        f"stk project members set-role {project_user} --project {project} --role admin",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert promote_role.exit_code == 0

    allowed = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name allowed --roles admin",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": viewer_token},
    )
    assert allowed.exit_code == 0
    assert "API Key" in allowed.output

    project_remove = env.runStkCli(
        f"stk project remove {project_user} --project {project}",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": owner_token},
    )
    assert project_remove.exit_code == 0

    revoked = env.runStkCli(
        f"stk apikey list --project {project} --env dev",
        workdir=FIXTURE_DIR,
        env={"STK_AUTH_TOKEN": viewer_token},
        check=False,
    )
    assert revoked.exit_code != 0
    assert "403" in revoked.output
