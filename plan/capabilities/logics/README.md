# Logics Capability Guide

이 도메인은 Bridge의 `/call` 엔드포인트를 통해 실행되는 커스텀 SQL 로직 흐름을 다룬다.
로직은 릴리즈 스냅샷에 선언된 SQL 정의 단위이며, Bridge가 인증·파라미터 검증·역할 검사를 거쳐
SQL을 실행하고 표준 응답 형식으로 반환한다. Hub는 릴리즈 배포에만 관여한다.

## 흐름 및 의존 관계

LOGICS-001이 인증 컨텍스트 바인딩이라는 핵심 메커니즘을 확립한다.
이후 capability는 공개 접근(LOGICS-002), 응답 형식(LOGICS-003), 파라미터 계약(LOGICS-004/005),
접근 제어(LOGICS-006), 에러 분류(LOGICS-007), 조건 게이트(LOGICS-008)를 순서대로 레이어링한다.

### 1단계 — 인증 컨텍스트 바인딩: `LOGICS-001`

Bridge가 자격증명에서 `:auth.sub`를 추출하고 로직 SQL 바인딩에 주입한다.
인증된 호출자가 SQL 내에서 자신의 identity를 참조할 수 있는 기반이 된다.
이 메커니즘 없이는 owner 필터나 역할 검사 등 이후 모든 capability가 성립하지 않는다.

- [`LOGICS-001`](LOGICS-001-whoami.md) — `:auth.sub` 시스템 변수 바인딩

### 2단계 — 공개 접근: `LOGICS-002`

자격증명 없이 호출 가능한 `public` auth 설정 로직을 검증한다.
LOGICS-001과 대조하여 Bridge의 auth 메타데이터 분기가 올바르게 동작하는지 확인한다.

- [`LOGICS-002`](LOGICS-002-public-hello.md) — 자격증명 없는 public 로직 실행

### 3단계 — 실행 전용 응답 형식: `LOGICS-003`

INSERT/UPDATE 등 행 반환이 없는 실행에서 Bridge가 `affected` 카운트를 포함한
표준 응답 형식을 내보내는지 검증한다. select와 구분되는 execute-only 계약이다.

- [`LOGICS-003`](LOGICS-003-exec-affected.md) — execute-only 응답 및 affected 카운트

### 4·5단계 — 파라미터 계약: `LOGICS-004`, `LOGICS-005`

LOGICS-004는 필수 파라미터 누락 시 SQL 실행 전에 400을 반환한다.
LOGICS-005는 파라미터 미입력 시 선언된 기본값이 SQL 바인딩에 주입됨을 검증한다.
두 capability 모두 Bridge의 파라미터 파이프라인이 DB 왕복 전에 검증을 완료함을 보장한다.

- [`LOGICS-004`](LOGICS-004-param-required.md) — 필수 파라미터 검증
- [`LOGICS-005`](LOGICS-005-param-defaults.md) — 기본값 파라미터 주입

### 6단계 — 역할 접근 제어: `LOGICS-006`

Bridge가 로직 auth 메타데이터에서 요구 역할을 읽고 호출자의 역할과 대조한다.
SQL이 실행되기 전에 역할 불일치는 403으로 차단된다.
OPERATOR-002에서 발급한 API key의 역할 바인딩이 이 검사의 입력이 된다.

- [`LOGICS-006`](LOGICS-006-role-guard.md) — role guard 적용 (LOGICS-001, OPERATOR-002 의존)

### 7단계 — 에러 분류: `LOGICS-007`

파라미터 누락, 라우트 미존재, 미인증, 역할 불충분, 타입 불일치를 각각 400/404/401/403/400으로
구분하여 구조화된 응답을 반환한다. 클라이언트가 오류 종류를 구별할 수 있어야 한다.

- [`LOGICS-007`](LOGICS-007-errors.md) — 공통 에러 분류 및 구조화 응답

### 8단계 — CEL 조건 게이트: `LOGICS-008`

로직 정의에 선언된 `condition` CEL 식을 SQL 실행 전에 평가한다.
이 단계의 CEL 컨텍스트는 request-scoped(`request.auth.*`, `request.params.*`)로 제한하며,
`resource.*` 참조는 미지원으로 조기 거부한다.

- [`LOGICS-008`](LOGICS-008-condition-gate.md) — request-scoped CEL 조건 검사 (SQL 실행 전)

## 컴포넌트 경계 요약

Logics 도메인의 모든 런타임 처리는 Bridge(`bridge/src/handlers/call.rs`)에서 완결된다.
Hub는 릴리즈에 로직 정의를 포함시키는 역할만 한다.

| Capability | Bridge — 검증 단계 | Bridge — 실행 단계 |
|---|---|---|
| LOGICS-001 | auth context 추출 | `:auth.sub` SQL 바인딩 |
| LOGICS-002 | public 분기 | SQL 실행 |
| LOGICS-003 | — | execute-only 응답 형식 |
| LOGICS-004/005 | 파라미터 검증·기본값 주입 | SQL 바인딩 |
| LOGICS-006 | 역할 검사 (SQL 실행 전 차단) | 역할 통과 시 실행 |
| LOGICS-007 | 에러 분류·구조화 | — |
| LOGICS-008 | CEL 조건 검사(요청 컨텍스트) | 조건 통과 시 실행 |
