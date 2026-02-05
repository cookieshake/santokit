from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_flow_04_enduser_login_external_oidc(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("oidc")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)

    env.runStkCli(
        f"stk --project {project} --env dev oidc provider set "
        f"--name demo --issuer https://issuer.example.com "
        f"--auth-url https://issuer.example.com/auth "
        f"--token-url https://issuer.example.com/token "
        f"--client-id demo --client-secret demo "
        f"--redirect-uri https://app.example.com/callback",
        workdir=FIXTURE_DIR,
    )

    resp = env.httpToHub(
        "GET",
        "/oidc/demo/start?redirect=https://app.example.com/callback",
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert resp.status_code in (302, 307)
    assert "issuer.example.com/auth" in resp.headers.get("location", "")
