import json
import os
import subprocess
from pathlib import Path

import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/column_permissions"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-003")]


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


def _mcp_call(cli_bin: Path, repo_root: Path, env: dict, request: dict) -> dict:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    )
    payload += "\n" + json.dumps(request) + "\n"
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


def test_mcp_permissions_tool(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "mcp_perm", "mcp-perm-r1")

    repo_root = _repo_root()
    cli_bin = _build_cli(repo_root)

    authorized_env = os.environ.copy()
    authorized_env.update(
        {
            "STK_HUB_URL": "http://localhost:4000",
            "STK_PROJECT": project,
            "STK_ENV": "dev",
            "STK_AUTH_TOKEN": "operator-token",
        }
    )
    forbidden_env = dict(authorized_env)
    forbidden_env.pop("STK_AUTH_TOKEN", None)

    ok = _mcp_call(
        cli_bin,
        repo_root,
        authorized_env,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "permissions_get_table",
                "arguments": {"table": "users"},
            },
        },
    )
    assert ok["id"] == 2
    rules = ok["result"]["rules"]
    assert set(rules.keys()) == {"select", "insert", "update", "delete"}
    assert rules["select"][0]["roles"] == ["admin"]
    assert rules["select"][0]["allow"] is True
    assert rules["select"][0]["columns"] == ["*"]
    assert rules["update"][0]["roles"] == ["admin"]
    assert rules["update"][0]["columns"] == ["name", "avatar_url"]

    not_found = _mcp_call(
        cli_bin,
        repo_root,
        authorized_env,
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "permissions_get_table",
                "arguments": {"table": "missing_table"},
            },
        },
    )
    assert not_found["id"] == 3
    assert not_found["error"]["code"] == -32004
    assert "NOT_FOUND" in not_found["error"]["message"]

    forbidden = _mcp_call(
        cli_bin,
        repo_root,
        forbidden_env,
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "permissions_get_table",
                "arguments": {"table": "users"},
            },
        },
    )
    assert forbidden["id"] == 4
    assert forbidden["error"]["code"] == -32003
    assert "FORBIDDEN" in forbidden["error"]["message"]
