import re
from dsl import unique_project, bootstrap_project, create_api_key, api_key_headers

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_operator_bootstrap(compose_env):
    """Flow 01: Project bootstrap with basic setup"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("bootstrap")

    result = env.runStkCli(
        f"stk project create {project}",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0

    for name in ["dev", "prod"]:
        result = env.runStkCli(
            f"stk env create --project {project} {name}",
            workdir=FIXTURE_DIR,
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


def test_operator_apikey(compose_env):
    """Flow 02: API key CRUD operations"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "apikey", "apikey-1")

    create = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name server --roles admin",
        workdir=FIXTURE_DIR,
    )
    assert create.exit_code == 0
    match = re.search(r"API Key \(store securely\): (\S+)", create.output)
    assert match
    api_key = match.group(1)

    list_keys = env.runStkCli(
        f"stk apikey list --project {project} --env dev",
        workdir=FIXTURE_DIR,
    )
    assert list_keys.exit_code == 0
    assert "server" in list_keys.output

    headers = api_key_headers(api_key, project)
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers=headers,
    )
    assert resp.status_code in (200, 403)


def test_operator_schema_change(compose_env):
    """Flow 06: Schema migration"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "schema", "schema-1")

    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref schema-2",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0


def test_operator_permissions_change(compose_env):
    """Flow 07: Permissions migration"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "perms", "permissions-1")

    result = env.runStkCli(
        f"stk apply --project {project} --env dev --ref permissions-2",
        workdir=FIXTURE_DIR,
    )
    assert result.exit_code == 0


def test_operator_release_promotion_rollback(compose_env):
    """Flow 08: Release promotion and rollback (dev → prod)"""
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
        f"stk apply --project {project} --env dev --ref release-1",
        workdir=FIXTURE_DIR,
    )

    env.runStkCli(
        f"stk schema snapshot --project {project} --env prod",
        workdir=FIXTURE_DIR,
    )

    promote = env.runStkCli(
        f"stk release promote --project {project} --from dev --to prod",
        workdir=FIXTURE_DIR,
    )
    assert promote.exit_code == 0

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref release-2",
        workdir=FIXTURE_DIR,
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
