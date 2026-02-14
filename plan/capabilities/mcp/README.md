# MCP Capability Guide

이 도메인은 AI 도구(LLM, Copilot, 에디터 통합 에이전트 등)가 Santokit 프로젝트의 스키마·권한·릴리즈·로직 구조를 이해하고 상호작용할 수 있도록 MCP(Model Context Protocol) 서버를 제공하는 capability들을 다룬다. MCP 서버를 통해 AI는 현재 배포 상태를 정확히 파악한 채로 코드 생성, API 호출 코드 작성, 권한 규칙 리뷰 등의 작업을 수행할 수 있다.

## 전제 조건

모든 MCP capability는 OPERATOR-001(bootstrap)을 전제한다. Hub에 `project/env` 스코프와 유효한 릴리즈 포인터가 없으면 MCP 서버는 의미 있는 정보를 제공할 수 없다.

## 전송 모드 — stdio와 SSE

MCP 서버는 두 가지 전송 모드로 기동한다.

**stdio 모드** (`stk mcp run`)는 에디터 통합에 사용한다. VS Code, Cursor 등의 에디터가 MCP 클라이언트를 subprocess로 실행할 때 stdin/stdout으로 MCP JSON-RPC 메시지를 교환한다. 에디터 워크스페이스 안에서 AI 에이전트가 Santokit 프로젝트 구조를 직접 참조할 때 이 모드를 사용한다.

**SSE 모드** (`stk mcp start [--port]`)는 HTTP 기반 MCP 클라이언트 연동에 사용한다. `http://localhost:<port>/sse`로 SSE 연결을 수립하며, 웹 기반 AI 도구나 외부 에이전트 플랫폼과의 연동에 적합하다.

## 컨텍스트 스코핑

두 모드 모두 서버 기동 시점의 CLI 컨텍스트(`project`, `env`)를 고정하여 사용한다. MCP 세션 도중에 `project/env`를 전환하는 것은 MVP에서 지원하지 않는다. 컨텍스트를 변경하려면 `stk context set ...`으로 컨텍스트를 교체한 뒤 MCP 서버를 재시작해야 한다. 이 설계는 세션 내 컨텍스트 불일치로 인한 오답 생성을 방지한다.

## MVP 6개 Tool

MVP는 AI가 "현재 배포된 상태"를 정확히 파악하는 데 필요한 최소한의 tool 집합을 제공한다.

### 스키마 조회 — MCP-002

- [`MCP-002`](MCP-002-schema-tools.md) — `schema_list_tables` / `schema_get_table`

`schema_list_tables`는 현재 릴리즈에 포함된 모든 테이블 이름과 연결(connection) 정보를 반환한다. `schema_get_table`은 특정 테이블의 컬럼 목록(이름, 타입, nullable), 기본 키, 외래 키를 반환한다. AI가 프론트엔드 코드나 API 호출 코드를 생성할 때 스키마 근거를 확보하는 출발점이 된다.

### 권한 조회 — MCP-003

- [`MCP-003`](MCP-003-permissions-tool.md) — `permissions_get_table`

특정 테이블에 적용된 오퍼레이션별(select/insert/update/delete) 권한 규칙을 반환한다. 각 규칙에는 적용 역할, 행 수준 조건식, 허용 컬럼 목록이 포함된다. AI가 권한 규칙을 준수하는 코드를 생성하거나 기존 코드가 올바른 권한 모델 위에 작성되었는지 리뷰할 때 활용한다. `project:viewer` 이상의 Operator RBAC 역할이 있어야 호출할 수 있다.

### 릴리즈 정보 — MCP-004

- [`MCP-004`](MCP-004-release-tool.md) — `release_current`

현재 `project/env`에 배포된 릴리즈의 `releaseId`, `project`, `env`를 반환한다. AI가 디버깅 지원을 하거나 생성한 응답이 어떤 릴리즈 기준인지 명확히 추적할 때 사용한다.

### 로직 조회 — MCP-005

- [`MCP-005`](MCP-005-logic-tools.md) — `logic_list` / `logic_get`

`logic_list`는 현재 릴리즈에 등록된 모든 custom SQL logic 이름을 반환한다. `logic_get`은 특정 logic의 SQL 텍스트, 파라미터 선언(이름, 타입, required 여부), 인증/역할 설정을 반환한다. AI가 logic 기반 API 호출 코드를 생성하거나 파라미터 바인딩을 검증할 때 활용한다.

## 보안 — RBAC와 민감 정보 필터링

- [`MCP-006`](MCP-006-security.md) — 횡단 보안 규칙

MCP 서버의 모든 tool 응답은 민감 정보 필터링 레이어를 거친다. DB 연결 URL, API 키 값, access/refresh/service token, Authorization 헤더 원문은 어떤 tool 응답에도 포함되지 않는다. `releaseId`, 테이블명, 컬럼명, 역할명 같은 식별자·메타데이터는 노출 허용 대상이다.

Operator RBAC 정책은 모든 tool 호출에 일관되게 적용된다. `permissions_get_table`은 `project:viewer` 이상의 역할을 요구하며, 역할이 충족되지 않으면 데이터 없이 FORBIDDEN 오류만 반환된다. 모든 tool은 기본 5초 타임아웃을 가지며 초과 시 부분 응답 없이 TIMEOUT 오류로 종료된다.

## Capability 의존 관계 요약

```
OPERATOR-001 (bootstrap)
     └── MCP-001 (서버 기동 — stdio / SSE)
              ├── MCP-002 (schema_list_tables / schema_get_table)
              ├── MCP-003 (permissions_get_table)
              ├── MCP-004 (release_current)
              ├── MCP-005 (logic_list / logic_get)
              └── MCP-006 (보안 — 횡단 규칙)
```

## Tool 일람

| Capability | Tool | 설명 | 최소 RBAC 역할 |
|---|---|---|---|
| MCP-002 | `schema_list_tables` | 테이블 목록 + 연결 이름 | — |
| MCP-002 | `schema_get_table` | 컬럼·타입·PK·FK | — |
| MCP-003 | `permissions_get_table` | 오퍼레이션별 권한 규칙 | `project:viewer` |
| MCP-004 | `release_current` | 현재 releaseId + project + env | — |
| MCP-005 | `logic_list` | logic 이름 목록 | — |
| MCP-005 | `logic_get` | SQL + params + auth 설정 | — |
