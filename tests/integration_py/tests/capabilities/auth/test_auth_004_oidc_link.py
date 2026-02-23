from urllib.parse import parse_qs, urlparse

import pytest

from dsl import bootstrap_project, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("auth"), pytest.mark.capability("AUTH-004")]


def _location(resp):
    return resp.headers.get("Location") or resp.headers.get("location")


def _query_value(url: str, key: str) -> str:
    parsed = urlparse(url)
    return parse_qs(parsed.query)[key][0]


def test_enduser_explicit_oidc_link(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "oidc_link", "enduser-1")
    headers = {"Authorization": f"Bearer {env._auth_token}"}

    provider_payload = {
        "project": project,
        "env": "dev",
        "name": "google",
        "issuer": "https://accounts.google.com",
        "auth_url": f"http://localhost:4000/oidc/google/callback-mock",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "client_id": "fake-client-id",
        "client_secret": "fake-client-secret",
        "redirect_uris": ["https://app.example.com/auth/callback"],
    }
    create_provider = env.httpToHub(
        "POST", "/api/oidc/providers", json=provider_payload, headers=headers
    )
    assert create_provider.status_code == 201

    no_session_start = env.httpToHub(
        "GET",
        f"/oidc/google/start?mode=link&project={project}&env=dev&redirect_uri=https://app.example.com/auth/callback",
    )
    assert no_session_start.status_code == 401

    token_a = signup_and_login(env, project, "a@example.com", "pw123")
    token_b = signup_and_login(env, project, "b@example.com", "pw123")

    sub_a_resp = env.httpToHub(
        "POST", "/internal/tokens/verify", json={"token": token_a}
    )
    assert sub_a_resp.status_code == 200
    sub_a = sub_a_resp.json()["claims"]["sub"]

    link_start = env.httpToHub(
        "GET",
        f"/oidc/google/start?mode=link&project={project}&env=dev&redirect_uri=https://app.example.com/auth/callback",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert link_start.status_code == 302
    start_loc = _location(link_start)
    state = _query_value(start_loc, "state")

    callback = env.httpToHub(
        "GET", f"/oidc/google/callback?state={state}&subject=google-sub-1"
    )
    assert callback.status_code == 302
    exchange_code = _query_value(_location(callback), "exchange_code")

    invalid_exchange = env.httpToHub(
        "POST",
        "/oidc/google/exchange",
        json={"exchange_code": "ekc_invalid"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert invalid_exchange.status_code == 400

    do_link = env.httpToHub(
        "POST",
        "/oidc/google/exchange",
        json={"exchange_code": exchange_code},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert do_link.status_code == 200
    assert do_link.json()["linked"] is True

    login_start = env.httpToHub(
        "GET",
        f"/oidc/google/start?mode=login&project={project}&env=dev&redirect_uri=https://app.example.com/auth/callback",
    )
    assert login_start.status_code == 302
    login_state = _query_value(_location(login_start), "state")

    login_callback = env.httpToHub(
        "GET", f"/oidc/google/callback?state={login_state}&subject=google-sub-1"
    )
    assert login_callback.status_code == 302
    login_code = _query_value(_location(login_callback), "exchange_code")

    login_exchange = env.httpToHub(
        "POST", "/oidc/google/exchange", json={"exchange_code": login_code}
    )
    assert login_exchange.status_code == 200
    assert login_exchange.json()["sub"] == sub_a

    conflict_start = env.httpToHub(
        "GET",
        f"/oidc/google/start?mode=link&project={project}&env=dev&redirect_uri=https://app.example.com/auth/callback",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert conflict_start.status_code == 302
    conflict_state = _query_value(_location(conflict_start), "state")
    conflict_cb = env.httpToHub(
        "GET", f"/oidc/google/callback?state={conflict_state}&subject=google-sub-1"
    )
    assert conflict_cb.status_code == 302
    conflict_code = _query_value(_location(conflict_cb), "exchange_code")

    conflict_exchange = env.httpToHub(
        "POST",
        "/oidc/google/exchange",
        json={"exchange_code": conflict_code},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert conflict_exchange.status_code == 409
