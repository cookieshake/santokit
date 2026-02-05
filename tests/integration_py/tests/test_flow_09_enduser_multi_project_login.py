from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_flow_09_enduser_multi_project_login(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project_a = unique_project("multi_a")
    project_b = unique_project("multi_b")

    for project in [project_a, project_b]:
        env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
        env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
        db_url = env.ensure_project_db(project)
        env.runStkCli(
            f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
            workdir=FIXTURE_DIR,
        )
        env.runStkCli(
            f"stk apply --project {project} --env dev --ref multi-1",
            workdir=FIXTURE_DIR,
        )

    for project in [project_a, project_b]:
        env.httpToHub(
            "POST",
            "/api/endusers/signup",
            json={"project": project, "env": "dev", "email": "user@example.com", "password": "pw"},
        )

    login_a = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project_a, "env": "dev", "email": "user@example.com", "password": "pw"},
    )
    login_b = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={"project": project_b, "env": "dev", "email": "user@example.com", "password": "pw"},
    )

    assert login_a.status_code == 200
    assert login_b.status_code == 200

    cookies_a = login_a.headers.get("set-cookie", "")
    cookies_b = login_b.headers.get("set-cookie", "")

    assert f"stk_access_{project_a}_dev" in cookies_a
    assert f"stk_access_{project_b}_dev" in cookies_b
