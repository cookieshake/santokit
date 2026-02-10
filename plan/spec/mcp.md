# MCP 서버 — Spec (요약)

목표:
- AI 도구(LLM, Copilot 등)가 Santokit 프로젝트의 스키마, 권한, 릴리즈, DB 상태를 조회하고 상호작용할 수 있도록 MCP(Model Context Protocol) 서버를 제공한다.
- AI 기반 개발 경험(코드 생성, 디버깅, 마이그레이션 지원)을 가능하게 한다.

Encore 참고:
- Encore는 `encore mcp start` (SSE) / `encore mcp run` (stdio) 두 가지 모드의 MCP 서버를 제공한다.
- **20개 이상의 도구**를 노출한다:
  - 데이터베이스: 쿼리 실행, 메타데이터 조회, 스키마 검사
  - API: 엔드포인트 호출, 서비스 목록, 요청/응답 타입 조회
  - 트레이스: 최근 트레이스 조회, 에러 트레이스 필터링
  - 소스 코드: 파일 검색, 서비스 구조 탐색
  - Pub/Sub: 토픽/구독 조회, 메시지 게시
  - 스토리지: 버킷/오브젝트 조회
  - 캐시: 키스페이스/클러스터 조회
  - 메트릭, Cron, 시크릿, 문서 검색
- 핵심 가치: AI가 **실제 런타임 상태**를 보고 정확한 코드를 생성하거나 디버깅을 지원한다. 스키마만 보는 것이 아니라, 실제 DB 쿼리 결과, 트레이스, 에러 로그까지 접근한다.
- Santokit의 YAML 기반 선언적 모델은 MCP에 매우 적합하다 — 스키마 IR이 구조화되어 있어 AI가 파싱하기 쉽다.

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
- `logic_list`, `logic_get` (Custom Logic 기반 프로젝트를 위해)

MVP에서 제외(Non-MVP):
- `db_query`, `db_metadata` (운영 데이터 접근/보안 정책이 더 필요)
- `schema_diff` (드리프트/plan과 결합되는 UX 결정 필요)
- `permissions_evaluate` (평가 컨텍스트 모델을 먼저 고정해야 함)
- `release_diff` (diff 표현 포맷 결정 필요)

---

## 2) 노출 도구 (Tools)

### 2.1 스키마 (Schema)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `schema_list_tables` | 테이블 목록 조회 | — |
| `schema_get_table` | 테이블 상세 (컬럼, 타입, FK, PK) | `table` |
| `schema_get_connections` | DB 연결 목록 | — |
| `schema_diff` | 선언 스키마 vs 실제 DB 차이 | `connection` |

### 2.2 권한 (Permissions)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `permissions_get` | 전체 권한 설정 조회 | — |
| `permissions_get_table` | 특정 테이블의 권한 규칙 | `table` |
| `permissions_evaluate` | 주어진 조건에서 권한 평가 시뮬레이션 | `table`, `op`, `roles`, `context` |

### 2.3 릴리즈 (Releases)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `release_current` | 현재 릴리즈 정보 | — |
| `release_history` | 릴리즈 히스토리 | `limit` |
| `release_diff` | 두 릴리즈 간 차이 | `from`, `to` |

### 2.4 데이터베이스 (Database)

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `db_query` | 읽기 전용 SQL 쿼리 실행 | `connection`, `sql`, `params` |
| `db_metadata` | DB 메타데이터 (버전, 테이블 크기, 인덱스) | `connection` |

### 2.5 Custom Logic

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `logic_list` | 등록된 로직 목록 | — |
| `logic_get` | 로직 상세 (SQL, 파라미터, 권한) | `name` |

### 2.6 Storage

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `storage_list_buckets` | 버킷 목록 | — |
| `storage_get_policy` | 버킷 정책 조회 | `bucket` |

### 2.7 Audit

| 도구 | 설명 | 파라미터 |
|------|------|----------|
| `audit_recent` | 최근 감사 로그 | `limit`, `action` |

### 2.8 Tool 계약(예시, MVP)

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
- `db_query`는 **읽기 전용**으로 제한한다 (`SET TRANSACTION READ ONLY`).
- Hub API 호출은 현재 CLI에 로그인된 operator의 권한을 따른다 (RBAC 적용).
- 민감 정보(DB 연결 문자열, API 키 값)는 도구 응답에 포함하지 않는다.

### 3.1 RBAC 연계

- MCP tool 호출은 Hub의 Operator RBAC 정책을 따른다.
  - 예: `permissions_get_table`은 `project:viewer` 이상.
  - `db_query` 같은 강한 도구는 `project:admin` 이상(또는 MVP 제외).
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
- `db_query`를 지원하는 경우:
  - read-only 트랜잭션 강제
  - 최대 row 수 제한(기본 1000)
  - 결과 크기 제한(기본 1MB)
  - `SELECT`만 허용(MVP 기준), DDL/DML은 금지

---

## 4) 사용 시나리오

### 4.1 AI 코드 생성
- AI가 `schema_list_tables` + `schema_get_table`로 스키마를 파악한다.
- `permissions_get_table`로 권한 규칙을 확인한다.
- 이 정보를 바탕으로 프론트엔드 코드, API 호출 코드, 테스트 코드를 생성한다.

### 4.2 디버깅 지원
- AI가 `db_query`로 실제 데이터 상태를 확인한다.
- `release_current`로 현재 배포 상태를 파악한다.
- `audit_recent`로 최근 변경 이력을 추적한다.

### 4.3 마이그레이션 지원
- AI가 `schema_diff`로 선언 스키마와 실제 DB 차이를 확인한다.
- 필요한 스키마 변경을 제안한다.

---

## 5) 구현 우선순위

1. **stdio 모드** — 에디터 통합에 필수. 도구 5개 (schema 4개 + permissions 1개)로 시작.
2. **SSE 모드** — 웹 기반 AI 도구 연동.
3. **DB 쿼리 도구** — read-only 쿼리 지원.
4. **나머지 도구** — 릴리즈, 로직, 스토리지, 감사.

---

## 미결정

- Resource 노출 여부 (MCP resources vs tools-only)
- Prompt 템플릿 제공 여부 (MCP prompts)
- 멀티 project/env 전환을 MCP 세션 내에서 지원할 것인가
- db_query의 결과 행 수 제한 및 타임아웃 정책
