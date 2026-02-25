import json
import os
import subprocess
from pathlib import Path

import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-006")]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _build_cli(repo_root: Path) -> Path:
    subprocess.run(
        ["cargo", "build", "-p", "stk-cli"],
        cwd=repo_root,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return repo_root / "target" / "debug" / "stk-cli"


def _run_single_tool(
    cli_bin: Path, repo_root: Path, env: dict, req_id: int, name: str, arguments: dict
) -> dict:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    )
    payload += "\n"
    payload += json.dumps(
        {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
    )
    payload += "\n"
    proc = subprocess.run(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=env,
        input=payload,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1])


def test_mcp_security(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "mcp_sec", "mcp-sec-r1")

    repo_root = _repo_root()
    cli_bin = _build_cli(repo_root)

    base_env = os.environ.copy()
    base_env.update(
        {
            "STK_HUB_URL": "http://localhost:4000",
            "STK_PROJECT": project,
            "STK_ENV": "dev",
        }
    )

    authorized_env = dict(base_env)
    authorized_env["STK_AUTH_TOKEN"] = "operator-token"

    clean = _run_single_tool(
        cli_bin,
        repo_root,
        authorized_env,
        2,
        "release_current",
        {},
    )
    clean_text = json.dumps(clean)
    assert "postgres://" not in clean_text
    assert "access_token" not in clean_text
    assert "refresh_token" not in clean_text
    assert "service_token" not in clean_text
    assert "Authorization" not in clean_text
    assert "operator-token" not in clean_text

    forbidden = _run_single_tool(
        cli_bin,
        repo_root,
        base_env,
        3,
        "permissions_get_table",
        {"table": "users"},
    )
    assert forbidden["error"]["code"] == -32003
    assert "FORBIDDEN" in forbidden["error"]["message"]
    assert "result" not in forbidden

    timeout_env = dict(authorized_env)
    timeout_env["STK_MCP_TEST_DELAY_MS"] = "6000"
    timeout = _run_single_tool(
        cli_bin,
        repo_root,
        timeout_env,
        4,
        "schema_list_tables",
        {},
    )
    assert timeout["error"]["code"] == -32008
    assert "TIMEOUT" in timeout["error"]["message"]
    assert "result" not in timeout
