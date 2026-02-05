from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_flow_03_enduser_login_hub_issuer(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("enduser")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref enduser-1",
        workdir=FIXTURE_DIR,
    )

    signup = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={"project": project, "env": "dev", "email": "user@example.com", "password": "pw"},
    )
    assert signup.status_code == 200

    login = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project, "env": "dev", "email": "user@example.com", "password": "pw"},
    )
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert resp.status_code in (200, 403)
