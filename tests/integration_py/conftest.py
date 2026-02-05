import os
import time

import docker
import pytest
from testcontainers.compose import DockerCompose

from dsl import SantokitDsl


@pytest.fixture(scope="session")
def compose_env():
    base_dir = os.path.dirname(__file__)
    compose = DockerCompose(base_dir, compose_file_name="docker-compose.yaml")
    if hasattr(compose, "with_build"):
        compose = compose.with_build()
    compose.start()

    project = getattr(compose, "project_name", None)
    if not project:
        project = os.path.basename(base_dir).replace("-", "")

    docker_client = docker.from_env()
    cli_container = None
    db_container = None
    for _ in range(30):
        containers = docker_client.containers.list(
            filters={
                "label": [
                    f"com.docker.compose.project={project}",
                    "com.docker.compose.service=cli",
                ]
            }
        )
        if containers:
            cli_container = containers[0]
            break
        time.sleep(1)

    if not cli_container:
        compose.stop()
        raise RuntimeError("cli container not found")

    for _ in range(30):
        containers = docker_client.containers.list(
            filters={
                "label": [
                    f"com.docker.compose.project={project}",
                    "com.docker.compose.service=db",
                ]
            }
        )
        if containers:
            db_container = containers[0]
            break
        time.sleep(1)

    if not db_container:
        compose.stop()
        raise RuntimeError("db container not found")

    env = SantokitDsl(
        compose_project=project,
        hub_base="http://localhost:4000",
        bridge_base="http://localhost:3000",
        cli_container_id=cli_container.id,
        db_container_id=db_container.id,
    )
    env.wait_for_health()

    yield env

    compose.stop()
