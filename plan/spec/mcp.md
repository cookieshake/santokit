# MCP 서버 — Spec (요약)

목표:
- AI 도구(LLM, Copilot 등)가 Santokit 프로젝트의 스키마/권한/릴리즈/로직 정보를 조회하고 상호작용할 수 있도록 MCP(Model Context Protocol) 서버를 제공한다.
- AI 기반 개발 경험(코드 생성/리뷰)을 가능하게 한다.

---

## 1) CLI 명령어

```
stk mcp start [--port <port>]     # SSE 모드 (HTTP 서버)
stk mcp run                       # stdio 모드 (표준 입출력, MCP 클라이언트 연동용)
```

- SSE 모드: `http://localhost:<port>/sse`로 MCP 클라이언트가 연결한다.
- stdio 모드: VS Code, Cursor 등의 에디터 통합에 사용한다.
- 두 모드 모두 현재 CLI 컨텍스트(`project`, `env`)를 사용한다.

결정:
- MCP 세션 내에서 `project/env` 전환은 지원하지 않는다(MVP).
  - 전환이 필요하면 `stk context set ...` 후 MCP 서버를 다시 시작한다.

## 1.1 MVP 범위(결정)

MVP 목표:
- AI가 "현재 배포된 스키마/권한/릴리즈"를 정확히 파악하고 코드 생성/리뷰를 할 수 있게 한다.

MVP에 포함:
- `schema_list_tables`, `schema_get_table`
- `permissions_get_table`
- `release_current`
- `logic_list`, `logic_get`

---

## 2) 노출 도구 (Tools)

### 2.1 스키마 (Schema)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `schema_list_tables` | 테이블 목록 조회 | — |
| `schema_get_table` | 테이블 상세 (컬럼, 타입, FK, PK) | `table` |

### 2.2 권한 (Permissions)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `permissions_get_table` | 특정 테이블의 권한 규칙 | `table` |

### 2.3 릴리즈 (Releases)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `release_current` | 현재 릴리즈 정보 | — |
### 2.4 Custom Logic

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `logic_list` | 등록된 로직 목록 | — |
| `logic_get` | 로직 상세 (SQL, 파라미터, 권한) | `name` |

### 2.5 Tool 계약(예시, MVP)

MCP tool 호출/응답은 각 MCP 구현체의 표준(envelope) 위에 "tool별 payload"를 얹는다.
아래 예시는 tool별 payload의 형태를 고정한다.

`schema_list_tables` 응답 예시:
```json
{
  "tables": [
    { "name": "users", "connection": "main" },
    { "name": "posts", "connection": "main" }
  ]
}
```

`schema_get_table` 입력 예시:
```json
{ "table": "users" }
```

`schema_get_table` 응답 예시:
```json
{
  "name": "users",
  "connection": "main",
  "primaryKey": { "name": "id", "type": "string" },
  "columns": [
    { "name": "id", "type": "string", "nullable": false },
    { "name": "email", "type": "string", "nullable": false }
  ],
  "foreignKeys": []
}
```

`permissions_get_table` 입력/응답 예시:
```json
{ "table": "users" }
```

```json
{
  "table": "users",
  "rules": {
    "select": [ { "roles": ["admin"], "allow": true } ],
    "insert": [ { "roles": ["admin"], "allow": true } ]
  }
}
```

`release_current` 응답 예시:
```json
{ "releaseId": "rel_01H...", "project": "myapp", "env": "prod" }
```

`logic_list` 응답 예시:
```json
{ "logics": [ "purchase_item", "admin/users" ] }
```

에러:
- tool 수행 실패 시 `plan/spec/errors.md`의 코드로 표현한다.

---

## 3) 보안

- MCP 서버는 **현재 CLI 컨텍스트의 project/env 범위** 내에서만 동작한다.
- Hub API 호출은 현재 CLI에 로그인된 operator의 권한을 따른다 (RBAC 적용).
- 민감 정보(DB 연결 문자열, API 키 값)는 도구 응답에 포함하지 않는다.

### 3.1 RBAC 연계

- MCP tool 호출은 Hub의 Operator RBAC 정책을 따른다.
  - 예: `permissions_get_table`은 `project:viewer` 이상.
- 상세: `plan/spec/operator-rbac.md`

### 3.2 민감정보 필터링

금지(응답에 포함하지 않음):
- DB URL/비밀번호 등 secrets
- API key 값, access/refresh token, service token
- 쿠키 원문, Authorization 헤더 원문

허용:
- 식별자/메타데이터(예: `releaseId`, `kid`, 테이블/컬럼 이름)

### 3.3 리소스 제한(권장)

- 모든 tool은 timeout을 가진다(기본 5s).

---

## 4) 사용 시나리오

### 4.1 AI 코드 생성
- AI가 `schema_list_tables` + `schema_get_table`로 스키마를 파악한다.
- `permissions_get_table`로 권한 규칙을 확인한다.
- 이 정보를 바탕으로 프론트엔드 코드, API 호출 코드, 테스트 코드를 생성한다.

### 4.2 디버깅 지원
- `release_current`로 현재 배포 상태를 파악한다.

---

## 5) 구현 우선순위

1. **stdio 모드** — 에디터 통합에 필수. MVP 도구 6개로 시작.
2. **SSE 모드** — 웹 기반 AI 도구 연동.

---

미결정 항목은 `plan/notes/open-questions.md`에서 관리한다.
