---
id: MCP-002
domain: mcp
title: Schema tools — list tables and get table details
status: planned
depends: [MCP-001]
spec_refs: ["plan/spec/schema.md"]
test_refs: []
code_refs: []
---

## Intent

AI 도구가 현재 릴리즈에 포함된 데이터베이스 스키마 구조를 정확히 파악할 수 있도록 두 가지 스키마 조회 tool을 제공한다. `schema_list_tables`는 테이블 목록 전체를 반환하고, `schema_get_table`은 특정 테이블의 컬럼·타입·키 상세 정보를 반환한다. AI가 프론트엔드 코드, API 호출 코드, 테스트 코드를 생성할 때 스키마 근거로 활용한다.

## Execution Semantics

- `schema_list_tables` tool은 파라미터 없이 호출한다. 현재 릴리즈에 포함된 모든 테이블의 이름과 연결(connection) 이름을 반환한다.
- `schema_get_table` tool은 `table` 파라미터(테이블 이름 문자열)를 받는다. 해당 테이블의 컬럼 목록(이름, 타입, nullable), 기본 키(primaryKey), 외래 키(foreignKeys) 정보를 반환한다.
- 두 tool 모두 MCP-001이 확립한 현재 CLI 컨텍스트의 릴리즈 스냅샷을 읽는다. Hub에서 릴리즈 데이터를 조회하며, 캐시된 스냅샷이 있으면 우선 사용한다.
- 존재하지 않는 테이블 이름을 `schema_get_table`에 전달하면 `plan/spec/errors.md`에 정의된 에러 코드로 오류 응답을 반환한다.

## Observable Outcome

- `schema_list_tables` 호출 시 현재 릴리즈에 포함된 모든 테이블이 응답에 포함된다. 테이블이 없는 릴리즈에서는 빈 배열이 반환된다.
- `schema_get_table` 호출 시 요청한 테이블의 컬럼 타입, nullable 여부, 외래 키 관계가 정확히 반환된다.
- 알 수 없는 테이블 이름을 요청하면 오류 응답이 반환되고 다른 테이블 정보는 노출되지 않는다.

## Usage

`schema_list_tables` 호출 예시 및 응답:

```json
{}
```

```json
{
  "tables": [
    { "name": "users", "connection": "main" },
    { "name": "posts", "connection": "main" }
  ]
}
```

`schema_get_table` 호출 예시:

```json
{ "table": "users" }
```

응답:

```json
{
  "name": "users",
  "connection": "main",
  "primaryKey": { "name": "id", "type": "string" },
  "columns": [
    { "name": "id", "type": "string", "nullable": false },
    { "name": "email", "type": "string", "nullable": false },
    { "name": "display_name", "type": "string", "nullable": true },
    { "name": "created_at", "type": "timestamp", "nullable": false }
  ],
  "foreignKeys": []
}
```

외래 키가 있는 테이블 응답 예시:

```json
{
  "name": "posts",
  "connection": "main",
  "primaryKey": { "name": "id", "type": "string" },
  "columns": [
    { "name": "id", "type": "string", "nullable": false },
    { "name": "author_id", "type": "string", "nullable": false },
    { "name": "title", "type": "string", "nullable": false }
  ],
  "foreignKeys": [
    { "column": "author_id", "references": { "table": "users", "column": "id" } }
  ]
}
```

## Acceptance Criteria

- [ ] `schema_list_tables` 호출 시 현재 릴리즈에 포함된 모든 테이블이 `{ "tables": [...] }` 형태로 반환되며 각 항목에 `name`과 `connection` 필드가 포함된다.
- [ ] `schema_get_table` 호출 시 요청한 테이블의 모든 컬럼이 `name`, `type`, `nullable` 필드와 함께 반환된다.
- [ ] `schema_get_table` 응답에 `primaryKey` 필드가 포함되고 실제 기본 키 컬럼과 일치한다.
- [ ] 외래 키가 있는 테이블에 대해 `schema_get_table` 응답의 `foreignKeys` 배열이 참조 테이블과 컬럼을 정확히 포함한다.
- [ ] 현재 릴리즈에 존재하지 않는 테이블 이름으로 `schema_get_table`을 호출하면 오류 응답이 반환된다.

## Failure Modes

- 현재 컨텍스트에 로드된 릴리즈가 없는 경우: tool 호출이 릴리즈 없음 오류를 반환한다. MCP-001 기동 시 릴리즈 확인에 실패하지 않았더라도 릴리즈가 이후 삭제된 경우에 해당한다.
- 존재하지 않는 테이블 이름을 `schema_get_table`에 전달한 경우: `plan/spec/errors.md`의 NOT_FOUND에 해당하는 오류 응답이 반환되며, 다른 테이블 목록은 포함되지 않는다.
