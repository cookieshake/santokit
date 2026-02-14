---
id: MCP-006
domain: mcp
title: Security — sensitive data filtering and RBAC enforcement
status: planned
depends: [MCP-001]
spec_refs: ["plan/spec/operator-rbac.md"]
test_refs: []
code_refs: []
---

## Intent

MCP 서버를 통해 노출되는 모든 tool 응답에서 민감 정보가 유출되지 않도록 보장하고, Operator RBAC 정책에 따른 접근 제어를 모든 tool 호출에 일관되게 적용한다. 이 capability는 개별 tool이 아닌 MCP 서버 전체에 걸친 횡단 관심사(cross-cutting concern)를 다룬다. 또한 모든 tool에 기본 5초 타임아웃을 적용하여 장시간 실행으로 인한 리소스 점유를 방지한다.

## Execution Semantics

- 모든 MCP tool 응답은 반환 직전에 민감 정보 필터링 레이어를 거친다. 필터링 대상:
  - DB URL 및 비밀번호를 포함하는 연결 문자열 전체
  - API 키 값, access token, refresh token, service token
  - 쿠키 원문, Authorization 헤더 원문
- 식별자 및 메타데이터(`releaseId`, `kid`, 테이블명, 컬럼명, 역할명, logic 이름 등)는 필터링 대상이 아니며 응답에 포함 가능하다.
- 모든 tool 호출은 Hub의 Operator RBAC 정책에 따라 검증된다. 현재 CLI에 로그인된 operator의 역할이 해당 tool에 요구되는 최소 역할을 충족하지 않으면 데이터 없이 FORBIDDEN 오류를 반환한다.
  - `permissions_get_table`: `project:viewer` 이상 요구
  - `schema_list_tables`, `schema_get_table`, `release_current`, `logic_list`, `logic_get`: 최소 역할 요건은 `plan/spec/operator-rbac.md`를 따른다.
- 모든 tool은 기본 5초 타임아웃을 가진다. 타임아웃 초과 시 진행 중인 작업을 중단하고 타임아웃 오류를 반환한다. 응답이 부분적으로 생성된 경우에도 부분 응답은 반환하지 않는다.

## Observable Outcome

- 어떤 tool 응답에도 DB 연결 URL, 비밀번호, API 키 값, 토큰 원문이 포함되지 않는다.
- 충분하지 않은 RBAC 역할로 tool을 호출하면 FORBIDDEN 오류만 반환되고 부분 데이터는 노출되지 않는다.
- 5초 이내에 완료되지 않은 tool 호출은 타임아웃 오류로 종료된다.

## Usage

RBAC 거부 응답 예시 (`project:viewer` 미만 역할로 `permissions_get_table` 호출):

```json
{ "error": { "code": "FORBIDDEN", "message": "insufficient role: project:viewer required" } }
```

타임아웃 응답 예시:

```json
{ "error": { "code": "TIMEOUT", "message": "tool execution exceeded 5s limit" } }
```

민감 정보 필터링 예시 — 다음 값들은 어떤 tool 응답에도 나타나서는 안 된다:

```
# 필터링 대상 (응답에 포함 금지)
"db_url": "postgres://user:password@host:5432/db"
"api_key": "sk_live_abc123..."
"access_token": "v4.local.Abc123..."
"Authorization": "Bearer v4.local.Abc123..."

# 허용 (응답에 포함 가능)
"releaseId": "rel_01H..."
"table": "users"
"column": "email"
"role": "admin"
```

## Acceptance Criteria

- [ ] 모든 MCP tool 응답(정상 및 오류 모두)에 DB 연결 URL 또는 비밀번호가 포함되지 않는다.
- [ ] 모든 MCP tool 응답에 API 키 값이 포함되지 않는다.
- [ ] 모든 MCP tool 응답에 access token, refresh token, service token 원문이 포함되지 않는다.
- [ ] `project:viewer` 미만의 RBAC 역할로 `permissions_get_table`을 호출하면 FORBIDDEN 오류 코드가 반환되고 권한 데이터는 포함되지 않는다.
- [ ] RBAC 거부 시 오류 응답에 다른 테이블이나 logic의 부분 데이터가 포함되지 않는다.
- [ ] 5초 이내에 완료되지 않는 tool 호출은 타임아웃 오류로 응답하며 부분 응답을 반환하지 않는다.

## Failure Modes

- 호출자의 RBAC 역할이 tool에 요구되는 최소 역할을 충족하지 못하는 경우: FORBIDDEN 오류 코드로 응답하며 요청된 데이터를 포함하지 않는다.
- tool 실행이 5초 타임아웃을 초과하는 경우: TIMEOUT 오류 코드로 응답하며 부분적으로 조회된 데이터도 반환하지 않는다.
