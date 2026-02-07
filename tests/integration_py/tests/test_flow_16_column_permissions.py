import pytest
import re
from dsl import unique_project

FIXTURE_DIR = "tests/integration_py/fixtures/column_permissions"

def test_flow_16_column_permissions(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = unique_project("colperm")

    # ── 1. Setup ────────────────────────────────
    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref colperm-1",
        workdir=FIXTURE_DIR,
    )

    # API Key
    create = env.runStkCli(
        f"stk apikey create --project {project} --env dev --name tester --roles authenticated",
        workdir=FIXTURE_DIR,
    )
    match = re.search(r"API Key \(store securely\): (\S+)", create.output)
    assert match
    api_key = match.group(1)

    headers = {
        "X-Santokit-Api-Key": api_key,
        "X-Santokit-Project": project,
        "X-Santokit-Env": "dev",
    }

    # ── 2. columns.insert 테스트 ────────────────
    # 2-a. 허용된 컬럼으로 INSERT → 성공
    insert_ok = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"name": "Alice", "email": "alice@test.com", "avatar_url": "http://img/a.png", "bio": "hello"}
            }
        },
        headers=headers,
    )
    assert insert_ok.status_code == 200
    user_id = insert_ok.json()["data"]["ids"][0]

    # 2-b. 차단된 컬럼(c_ssn)으로 INSERT → 403 Forbidden
    insert_fail = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/insert",
            "params": {
                "data": {"name": "Bob", "c_ssn": "123-45-6789"}
            }
        },
        headers=headers,
    )
    assert insert_fail.status_code == 403
    assert "c_ssn" in insert_fail.text
    assert "not allowed for insert" in insert_fail.text

    # ── 3. columns.select 테스트 ────────────────
    # 3-a. 허용된 컬럼 명시적 SELECT → 성공
    select_ok = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/select",
            "params": {"select": ["name", "email"]}
        },
        headers=headers,
    )
    assert select_ok.status_code == 200
    row = select_ok.json()["data"]["data"][0]
    assert row["name"] == "Alice"
    assert row["email"] == "alice@test.com"

    # 3-b. 차단된 컬럼(c_ssn) 명시적 SELECT → 403 Forbidden
    select_fail = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/select",
            "params": {"select": ["name", "c_ssn"]}
        },
        headers=headers,
    )
    assert select_fail.status_code == 403
    assert "c_ssn" in select_fail.text
    assert "not allowed for select" in select_fail.text

    # ── 4. columns.update 테스트 ────────────────
    # 4-a. 허용된 컬럼(name) UPDATE → 성공
    update_ok = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"name": "Alice Updated"}
            }
        },
        headers=headers,
    )
    assert update_ok.status_code == 200

    # 검증: name이 변경되었는지
    verify = env.httpToBridge(
        "POST", "/call",
        json={"path": "db/users/select", "params": {"where": {"id": user_id}}},
        headers=headers,
    )
    assert verify.json()["data"]["data"][0]["name"] == "Alice Updated"

    # 4-b. 차단된 컬럼(email) UPDATE → 403 Forbidden
    update_fail_email = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"email": "hacked@test.com"}
            }
        },
        headers=headers,
    )
    assert update_fail_email.status_code == 403
    assert "email" in update_fail_email.text
    assert "not allowed for update" in update_fail_email.text

    # 4-c. 차단된 컬럼(bio) UPDATE → 403 Forbidden
    #      (bio는 insert에는 허용되지만 update에는 불허)
    update_fail_bio = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"bio": "new bio"}
            }
        },
        headers=headers,
    )
    assert update_fail_bio.status_code == 403
    assert "bio" in update_fail_bio.text
    assert "not allowed for update" in update_fail_bio.text

    # 4-d. 차단된 컬럼(c_ssn) UPDATE → 403 Forbidden
    update_fail_ssn = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"c_ssn": "999-99-9999"}
            }
        },
        headers=headers,
    )
    assert update_fail_ssn.status_code == 403
    assert "c_ssn" in update_fail_ssn.text
    assert "not allowed for update" in update_fail_ssn.text

    # ── 5. 허용된 컬럼만 사용하면 모두 정상 ────────
    update_ok2 = env.httpToBridge(
        "POST", "/call",
        json={
            "path": "db/users/update",
            "params": {
                "where": {"id": user_id},
                "data": {"name": "Final Name", "avatar_url": "http://img/final.png"}
            }
        },
        headers=headers,
    )
    assert update_ok2.status_code == 200

    # 최종 검증
    final = env.httpToBridge(
        "POST", "/call",
        json={"path": "db/users/select", "params": {"where": {"id": user_id}}},
        headers=headers,
    )
    row_final = final.json()["data"]["data"][0]
    assert row_final["name"] == "Final Name"
    assert row_final["avatar_url"] == "http://img/final.png"
