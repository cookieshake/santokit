from dsl import unique_project, bootstrap_project, signup_and_login, jwt_headers

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"


def test_enduser_login_hub_issuer(compose_env):
    """Flow 03: End-user login with Hub issuer"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "enduser", "enduser-1")

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
        headers=jwt_headers(access_token, project),
    )
    assert resp.status_code == 403


def test_enduser_login_external_oidc(compose_env):
    """Flow 04: External OIDC provider login"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("oidc")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)

    resp = env.httpToHub(
        "POST",
        "/api/oidc/providers",
        json={
            "project": project,
            "env": "dev",
            "name": "test-oidc",
            "issuer": "https://accounts.google.com",
            "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
            "client_id": "fake-client-id",
            "client_secret": "fake-client-secret",
            "redirect_uris": ["https://example.com/callback"],
        },
        headers={"Authorization": f"Bearer {env._auth_token}"},
    )
    assert resp.status_code in (200, 201)


def test_enduser_multi_project_login(compose_env):
    """Flow 09: Multi-project login test"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project_a = bootstrap_project(env, FIXTURE_DIR, "multi_a", "enduser-1")
    project_b = bootstrap_project(env, FIXTURE_DIR, "multi_b", "enduser-1")

    email = "user@example.com"
    password = "pw123"

    token_a = signup_and_login(env, project_a, email, password)
    token_b = signup_and_login(env, project_b, email, password)

    resp_a = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers=jwt_headers(token_a, project_a),
    )
    assert resp_a.status_code == 403

    resp_b = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers=jwt_headers(token_b, project_b),
    )
    assert resp_b.status_code == 403
