import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import docker
import requests


@dataclass
class ExecResult:
    exit_code: int
    output: str


class SantokitDsl:
    def __init__(
        self,
        compose_project: str,
        hub_base: str,
        bridge_base: str,
        cli_container_id: str,
        db_container_id: str,
    ):
        self.compose_project = compose_project
        self.hub_base = hub_base
        self.bridge_base = bridge_base
        self.cli_container_id = cli_container_id
        self.db_container_id = db_container_id
        self.docker_client = docker.from_env()
        self._auth_token: Optional[str] = None

    def set_auth_token(self, token: str) -> None:
        self._auth_token = token

    def runStkCli(self, command: str, workdir: str, env: Optional[Dict[str, str]] = None) -> ExecResult:
        container = self.docker_client.containers.get(self.cli_container_id)
        merged_env = {
            "STK_HUB_URL": "http://hub:4000",
        }
        if self._auth_token:
            merged_env["STK_AUTH_TOKEN"] = self._auth_token
        if env:
            merged_env.update(env)
        exec_cmd = ["/bin/sh", "-lc", f"cd {workdir} && {command}"]
        result = container.exec_run(exec_cmd, environment=merged_env)
        output = result.output.decode("utf-8", errors="replace")
        if result.exit_code != 0:
            raise RuntimeError(f"stk command failed ({result.exit_code}): {command}\n{output}")
        return ExecResult(exit_code=result.exit_code, output=output)

    def httpToHub(self, method: str, path: str, json: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> requests.Response:
        url = f"{self.hub_base}{path}"
        return requests.request(method, url, json=json, headers=headers, timeout=20, allow_redirects=False)

    def httpToBridge(self, method: str, path: str, json: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> requests.Response:
        url = f"{self.bridge_base}{path}"
        return requests.request(method, url, json=json, headers=headers, timeout=20, allow_redirects=False)

    def login_operator(self, email: str, password: str) -> str:
        resp = self.httpToHub("POST", "/api/auth/login", json={"email": email, "password": password})
        resp.raise_for_status()
        token = resp.json()["token"]
        self.set_auth_token(token)
        return token

    def wait_for_health(self) -> None:
        wait_for_http(f"{self.hub_base}/health")
        wait_for_http(f"{self.bridge_base}/health")

    def ensure_project_db(self, project: str) -> str:
        db_name = project_db_name(project)
        self.ensure_db(db_name)
        return f"postgres://stk:stk@db:5432/{db_name}"

    def ensure_db(self, db_name: str) -> None:
        container = self.docker_client.containers.get(self.db_container_id)
        safe_name = sanitize_db_name(db_name)
        cmd = (
            "psql -U stk -d postgres -tAc "
            f"\"SELECT 1 FROM pg_database WHERE datname='{safe_name}'\" "
            "| grep -q 1 || "
            f"psql -U stk -d postgres -c \"CREATE DATABASE {safe_name};\""
        )
        result = container.exec_run(["/bin/sh", "-lc", cmd])
        output = result.output.decode("utf-8", errors="replace")
        if result.exit_code != 0:
            raise RuntimeError(f"db init failed ({result.exit_code}): {safe_name}\n{output}")


def wait_for_http(url: str, timeout: int = 60) -> None:
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(url, timeout=2)
            if resp.status_code < 500:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(f"service not ready: {url}")


def unique_project(prefix: str = "proj") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def write_schema(base_dir: str, yaml_text: str) -> None:
    schema_dir = os.path.join(base_dir, "schema")
    os.makedirs(schema_dir, exist_ok=True)
    with open(os.path.join(schema_dir, "users.yaml"), "w", encoding="utf-8") as f:
        f.write(yaml_text)


def write_permissions(base_dir: str, yaml_text: str) -> None:
    config_dir = os.path.join(base_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    with open(os.path.join(config_dir, "permissions.yaml"), "w", encoding="utf-8") as f:
        f.write(yaml_text)


def sanitize_db_name(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in name)
    if not safe:
        safe = "stk"
    return safe[:63]


def project_db_name(project: str) -> str:
    safe = sanitize_db_name(project)
    return sanitize_db_name(f"stk_{safe}")
