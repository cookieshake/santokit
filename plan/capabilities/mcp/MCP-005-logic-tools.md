---
id: MCP-005
domain: mcp
title: Logic tools — list and get logic details
status: planned
depends: [MCP-001]
spec_refs: ["plan/spec/mcp.md", "plan/spec/logics.md"]
test_refs: []
code_refs: []
---

## Intent

AI 도구가 현재 릴리즈에 등록된 custom SQL logic의 목록과 상세 정보를 조회할 수 있도록 두 가지 logic tool을 제공한다. `logic_list`는 등록된 logic 이름 목록을 반환하고, `logic_get`은 특정 logic의 SQL 텍스트, 파라미터 선언, 인증 설정 상세를 반환한다. AI가 logic 기반 API 호출 코드를 생성하거나 기존 logic을 리뷰할 때 활용한다.

## Execution Semantics

- `logic_list` tool은 파라미터 없이 호출한다. 현재 릴리즈에 등록된 모든 logic의 이름(path)을 배열로 반환한다. logic 이름은 `plan/spec/logics.md`에 정의된 `logics/{name}` 경로 규칙을 따른다.
- `logic_get` tool은 `name` 파라미터(logic 이름 문자열)를 받는다. 해당 logic의 SQL 텍스트(`sql`), 파라미터 선언 목록(`params`), 인증/역할 설정(`auth`)을 반환한다.
- 두 tool 모두 MCP-001이 확립한 현재 CLI 컨텍스트의 릴리즈 스냅샷을 읽는다.
- 존재하지 않는 logic 이름을 `logic_get`에 전달하면 `plan/spec/errors.md`에 정의된 NOT_FOUND 오류 코드로 응답한다.
- 민감 정보(DB 연결 문자열, API 키, 토큰 등)는 응답에 포함되지 않는다. SQL 텍스트, 파라미터 선언, 역할명은 메타데이터로서 노출 허용 대상이다.

## Observable Outcome

- `logic_list` 호출 시 현재 릴리즈에 등록된 모든 logic 이름이 `{ "logics": [...] }` 형태로 반환된다. logic이 없는 릴리즈에서는 빈 배열이 반환된다.
- `logic_get` 호출 시 요청한 logic의 SQL 텍스트, 파라미터 선언, 인증 설정이 정확히 반환된다.
- 알 수 없는 logic 이름을 요청하면 NOT_FOUND 오류 응답이 반환된다.

## Usage

`logic_list` 호출 예시 (파라미터 없음):

```json
{}
```

응답 예시:

```json
{ "logics": [ "purchase_item", "admin/users" ] }
```

`logic_get` 호출 예시:

```json
{ "name": "purchase_item" }
```

응답 예시:

```json
{
  "name": "purchase_item",
  "sql": "INSERT INTO purchases (user_id, item_id) VALUES (:user_id, :item_id) RETURNING id",
  "params": [
    { "name": "user_id", "type": "string", "required": true },
    { "name": "item_id", "type": "string", "required": true }
  ],
  "auth": { "required": true, "roles": ["authenticated"] }
}
```

인증이 불필요한 public logic 응답 예시:

```json
{
  "name": "admin/users",
  "sql": "SELECT id, email FROM users ORDER BY created_at DESC",
  "params": [],
  "auth": { "required": true, "roles": ["admin"] }
}
```

## Acceptance Criteria

- [ ] `logic_list` 호출 시 현재 릴리즈에 등록된 모든 logic 이름이 `{ "logics": [...] }` 형태로 반환된다.
- [ ] `logic_get` 호출 시 `sql`, `params`, `auth` 필드가 모두 포함된 응답이 반환된다.
- [ ] `logic_get` 응답의 `params` 배열에 각 파라미터의 `name`, `type`, `required` 필드가 포함된다.
- [ ] `logic_get` 응답의 `auth` 필드에 `required` 여부와 적용 `roles` 목록이 포함된다.
- [ ] 현재 릴리즈에 등록되지 않은 logic 이름으로 `logic_get`을 호출하면 NOT_FOUND 오류 응답이 반환된다.

## Failure Modes

- 현재 릴리즈에 logic이 하나도 등록되지 않은 경우: `logic_list`는 빈 배열(`{ "logics": [] }`)을 반환한다. 오류가 아니다.
- 존재하지 않는 logic 이름을 `logic_get`에 전달한 경우: `plan/spec/errors.md`의 NOT_FOUND에 해당하는 오류 응답이 반환된다.
