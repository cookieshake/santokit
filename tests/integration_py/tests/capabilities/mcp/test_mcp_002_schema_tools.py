import json
import os
import subprocess
from pathlib import Path

import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/expand"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-002")]


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


def test_mcp_schema_tools(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "mcp_schema", "mcp-schema-r1")
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
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "schema_list_tables", "arguments": {}},
        },
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "schema_get_table", "arguments": {"table": "users"}},
        },
        {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "schema_get_table", "arguments": {"table": "posts"}},
        },
        {
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {
                "name": "schema_get_table",
                "arguments": {"table": "missing_table"},
            },
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

    lines = [line for line in proc.stdout.strip().splitlines() if line.strip()]
    assert len(lines) == 6
    responses = {msg["id"]: msg for msg in (json.loads(line) for line in lines)}

    listed = responses[2]["result"]["tools"]
    tool_names = {tool["name"] for tool in listed}
    assert "schema_list_tables" in tool_names
    assert "schema_get_table" in tool_names

    tables = responses[3]["result"]["tables"]
    table_names = {item["name"] for item in tables}
    assert {"users", "posts"}.issubset(table_names)
    for item in tables:
        if item["name"] in {"users", "posts"}:
            assert item["connection"] == "main"

    users = responses[4]["result"]
    assert users["name"] == "users"
    assert users["primaryKey"]["name"] == "id"
    user_columns = {col["name"]: col for col in users["columns"]}
    assert "email" in user_columns
    assert user_columns["email"]["type"] == "string"
    assert user_columns["email"]["nullable"] is False

    posts = responses[5]["result"]
    assert posts["name"] == "posts"
    assert posts["foreignKeys"] == [
        {"column": "user_id", "references": {"table": "users", "column": "id"}}
    ]

    missing = responses[6]
    assert "error" in missing
    assert missing["error"]["code"] == -32004
    assert "NOT_FOUND" in missing["error"]["message"]
