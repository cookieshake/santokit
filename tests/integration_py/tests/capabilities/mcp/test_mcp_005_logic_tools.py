import json
import os
import subprocess
from pathlib import Path

import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-005")]


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


def test_mcp_logic_tools(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "mcp_logic", "mcp-logic-r1")

    repo_root = _repo_root()
    cli_bin = _build_cli(repo_root)
    cli_env = os.environ.copy()
    cli_env.update(
        {
            "STK_HUB_URL": "http://localhost:4000",
            "STK_PROJECT": project,
            "STK_ENV": "dev",
            "STK_AUTH_TOKEN": "operator-token",
        }
    )

    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "logic_list", "arguments": {}},
        },
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "logic_get", "arguments": {"name": "default_params"}},
        },
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "logic_get", "arguments": {"name": "admin_only"}},
        },
        {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "logic_get", "arguments": {"name": "missing_logic"}},
        },
    ]
    payload = "\n".join(json.dumps(item) for item in requests) + "\n"

    proc = subprocess.run(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=cli_env,
        input=payload,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0

    responses = {
        msg["id"]: msg
        for msg in (
            json.loads(line) for line in proc.stdout.splitlines() if line.strip()
        )
    }

    names = responses[2]["result"]["logics"]
    assert "default_params" in names
    assert "admin_only" in names

    default_params = responses[3]["result"]
    assert default_params["name"] == "default_params"
    assert "SELECT :greeting as greeting" in default_params["sql"]
    assert default_params["auth"]["required"] is False
    assert default_params["params"] == [
        {"name": "greeting", "type": "string", "required": False}
    ]

    admin_only = responses[4]["result"]
    assert admin_only["name"] == "admin_only"
    assert admin_only["auth"]["required"] is True
    assert admin_only["auth"]["roles"] == ["admin"]

    missing = responses[5]
    assert missing["error"]["code"] == -32004
    assert "NOT_FOUND" in missing["error"]["message"]
