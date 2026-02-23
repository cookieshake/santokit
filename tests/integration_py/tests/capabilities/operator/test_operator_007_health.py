import pytest

from dsl import bootstrap_project, unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("operator"), pytest.mark.capability("OPERATOR-007")]


def test_operator_health_and_readiness(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    hub_healthz = env.httpToHub("GET", "/healthz")
    assert hub_healthz.status_code == 200
    assert hub_healthz.json() == {"ok": True}

    bridge_healthz = env.httpToBridge("GET", "/healthz")
    assert bridge_healthz.status_code == 200
    assert bridge_healthz.json() == {"ok": True}

    internal_hub_healthz = env.httpToHub("GET", "/internal/healthz")
    assert internal_hub_healthz.status_code == 200
    assert internal_hub_healthz.json() == {"ok": True}

    pending_project = unique_project("health_pending")
    bridge_ready_before_release = env.httpToBridge(
        "GET", f"/readyz?project={pending_project}&env=dev"
    )
    assert bridge_ready_before_release.status_code == 503
    assert bridge_ready_before_release.json() == {"ok": False}

    project = bootstrap_project(env, FIXTURE_DIR, "health", "health-r1")
    assert project

    hub_readyz = env.httpToHub("GET", "/readyz")
    assert hub_readyz.status_code == 200
    assert hub_readyz.json() == {"ok": True}

    bridge_readyz = env.httpToBridge("GET", f"/readyz?project={project}&env=dev")
    assert bridge_readyz.status_code == 200
    assert bridge_readyz.json() == {"ok": True}
