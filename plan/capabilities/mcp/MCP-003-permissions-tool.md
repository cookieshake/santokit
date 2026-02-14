---
id: MCP-003
domain: mcp
title: Permissions tool — get table permissions
status: planned
depends: [MCP-001]
spec_refs: []
test_refs: []
code_refs: []
---

## Intent

AI 도구가 특정 테이블에 적용된 권한 규칙을 조회할 수 있도록 `permissions_get_table` tool을 제공한다. 어떤 역할이 어떤 오퍼레이션(select/insert/update/delete)을 허용하는지, 어떤 컬럼에 접근 가능한지를 파악하여 AI가 권한 규칙을 준수하는 코드를 생성하거나 기존 코드를 리뷰할 수 있게 한다. 이 tool은 Operator RBAC의 `project:viewer` 이상 역할이 있어야 호출할 수 있다.

## Execution Semantics

- `permissions_get_table` tool은 `table` 파라미터(테이블 이름 문자열)를 받는다. 해당 테이블에 대한 `permissions.yaml` 기반 권한 규칙을 오퍼레이션별로 반환한다.
- 반환되는 각 규칙(rule)은 `roles`(적용 대상 역할 목록), `allow`(허용 여부), 선택적으로 `condition`(행 수준 조건식), `columns`(허용 컬럼 목록)을 포함한다.
- tool 호출은 Hub의 Operator RBAC 정책을 따른다. 현재 CLI에 로그인된 operator가 `project:viewer` 이상의 역할을 갖지 않으면 RBAC 거부 오류를 반환한다.
- 민감 정보(DB 연결 문자열, API 키, 토큰 등)는 응답에 포함되지 않는다. 권한 규칙 메타데이터(역할명, 조건식 텍스트, 컬럼명)만 반환된다.
- 존재하지 않는 테이블 이름을 전달하면 `plan/spec/errors.md`에 정의된 오류 코드로 응답한다.

## Observable Outcome

- `permissions_get_table` 호출 시 `permissions.yaml`에 선언된 해당 테이블의 모든 오퍼레이션별 규칙이 반환된다.
- `project:viewer` 미만의 Operator가 호출하면 데이터 없이 RBAC 거부 오류만 반환된다.
- 알 수 없는 테이블 이름이면 오류 응답이 반환되고 다른 테이블의 권한 정보는 노출되지 않는다.

## Usage

`permissions_get_table` 호출 예시:

```json
{ "table": "users" }
```

응답 예시:

```json
{
  "table": "users",
  "rules": {
    "select": [
      { "roles": ["admin"], "allow": true },
      { "roles": ["authenticated"], "allow": true, "condition": "id = :auth.sub" }
    ],
    "insert": [
      { "roles": ["admin"], "allow": true }
    ],
    "update": [
      { "roles": ["admin"], "allow": true },
      { "roles": ["authenticated"], "allow": true, "condition": "id = :auth.sub", "columns": ["display_name"] }
    ],
    "delete": [
      { "roles": ["admin"], "allow": true }
    ]
  }
}
```

오퍼레이션이 정의되지 않은 경우 해당 오퍼레이션 키는 빈 배열 또는 응답에서 생략된다.

RBAC 거부 응답 예시:

```json
{ "error": { "code": "FORBIDDEN", "message": "insufficient role: project:viewer required" } }
```

## Acceptance Criteria

- [ ] `project:viewer` 이상의 역할을 가진 operator가 `permissions_get_table`을 호출하면 `permissions.yaml`에 선언된 규칙과 일치하는 응답이 반환된다.
- [ ] 응답에서 오퍼레이션별(`select`, `insert`, `update`, `delete`) 규칙 목록이 정확히 반환되며 각 규칙의 `roles`, `allow` 필드가 포함된다.
- [ ] `condition`이 정의된 규칙은 응답에 `condition` 필드가 포함된다.
- [ ] `columns`이 명시된 규칙은 응답에 `columns` 배열이 포함된다.
- [ ] `project:viewer` 미만의 역할로 호출하면 RBAC 거부 오류가 반환되고 권한 규칙 데이터는 포함되지 않는다.
- [ ] 존재하지 않는 테이블 이름으로 호출하면 NOT_FOUND 오류가 반환된다.

## Failure Modes

- 현재 CLI operator가 `project:viewer` 미만의 RBAC 역할을 가진 경우: FORBIDDEN 오류 코드로 응답하며 권한 데이터를 포함하지 않는다.
- 존재하지 않는 테이블 이름을 전달한 경우: NOT_FOUND 오류 코드로 응답하며 다른 테이블 정보는 포함되지 않는다.
