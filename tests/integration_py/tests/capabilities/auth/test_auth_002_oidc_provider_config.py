import pytest

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("auth"), pytest.mark.capability("AUTH-002")]


def test_enduser_login_external_oidc(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("oidc")
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)

    valid_payload = {
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
    }
    headers = {"Authorization": f"Bearer {env._auth_token}"}

    ok = env.httpToHub(
        "POST", "/api/oidc/providers", json=valid_payload, headers=headers
    )
    assert ok.status_code == 201

    duplicate = env.httpToHub(
        "POST", "/api/oidc/providers", json=valid_payload, headers=headers
    )
    assert duplicate.status_code == 409

    malformed = dict(valid_payload)
    malformed["name"] = "bad-issuer"
    malformed["issuer"] = "http://invalid.local"
    bad_issuer = env.httpToHub(
        "POST", "/api/oidc/providers", json=malformed, headers=headers
    )
    assert bad_issuer.status_code == 400
