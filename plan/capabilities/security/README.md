# Security Capability Guide

이 도메인은 Bridge의 권한 엔진이 `permissions.yaml` 정책을 런타임에 강제하는 방식을 다룬다.
모든 capability는 CRUD-001이 확립한 data-plane 계약 위에서 동작하며,
정책 평가 결과는 SQL 술어(row-level) 또는 컬럼 프로젝션(column-level)으로 변환된다.
Hub는 릴리즈에 정책을 포함시키는 역할만 하고 런타임 강제는 Bridge가 단독으로 수행한다.

## 흐름 및 의존 관계

Row-level 제어(SECURITY-001~003)와 Column-level 제어(SECURITY-004~005)는 독립적인 정책 축이다.
CEL 조건 지원 범위가 SECURITY-001 → 002 → 003 순으로 확장되며,
컬럼 접근 제어는 SECURITY-004와 SECURITY-005가 서로 다른 관점(가시성 vs. 읽기/쓰기)을 커버한다.

### 1축 — Row-Level 접근 제어: `SECURITY-001`, `SECURITY-002`, `SECURITY-003`

`permissions.yaml` 규칙의 CEL condition이 SQL 술어로 변환되어 요청 필터와 결합된다.
클라이언트가 where 조건을 임의로 조작해도 정책 술어가 우선 적용되므로 row 격리가 보장된다.

**SECURITY-001** — `resource.<column> == :auth.sub` 형태의 인증 컨텍스트 기반 조건.
owner-like 접근 제어의 핵심이며 `:auth.sub` 바인딩이 SQL 술어로 주입된다.

**SECURITY-002** — `resource.<column> == "literal"` 형태의 고정값 조건.
상태 게이트(status gate)처럼 클라이언트 협력 없이 필터를 강제해야 할 때 사용한다.

**SECURITY-003** — 지원하지 않는 CEL 패턴을 조기에 거부하는 경계 케이스.
평가 불가 조건은 silent pass가 아닌 명시적 오류로 처리된다.

- [`SECURITY-001`](SECURITY-001-cel-condition.md) — `:auth.sub` 기반 row-level 조건
- [`SECURITY-002`](SECURITY-002-cel-literal.md) — literal 값 기반 row-level 조건
- [`SECURITY-003`](SECURITY-003-cel-unsupported.md) — 미지원 CEL 패턴 거부

### 2축 — Column-Level 접근 제어: `SECURITY-004`, `SECURITY-005`

규칙의 `columns` 목록이 컬럼 가시성과 쓰기 허용 범위를 결정한다.
`columns` 미지정 또는 `["*"]`이면 전체 허용, 특정 목록이면 그 외 컬럼은 차단된다.
컬럼 이름 접두사(`c_`, `p_`, `_` 등)는 어떠한 암묵적 필터링도 하지 않는다.

**SECURITY-004** — 역할별로 다른 `columns` 목록을 선언했을 때 select 응답에서
허용 컬럼만 프로젝션되는지 검증한다. 동일 row를 역할에 따라 다른 필드 집합으로 관측한다.

**SECURITY-005** — select 응답 프로젝션뿐 아니라 insert/update 쓰기 페이로드도
`columns` 목록으로 검증한다. 허용되지 않은 컬럼의 쓰기는 SQL 실행 전에 차단된다.

- [`SECURITY-004`](SECURITY-004-column-prefix.md) — 역할별 컬럼 가시성 (읽기)
- [`SECURITY-005`](SECURITY-005-column-permissions.md) — 역할별 컬럼 접근 (읽기·쓰기)

## 컴포넌트 경계 요약

| Capability | Bridge — 정책 평가 | SQL 계층 | Hub |
|---|---|---|---|
| SECURITY-001/002 | CEL → SQL 술어 변환 | 술어 결합 실행 | 릴리즈에 정책 포함 |
| SECURITY-003 | 미지원 CEL 조기 거부 | — | — |
| SECURITY-004 | columns 프로젝션 (읽기) | SELECT 컬럼 제한 | — |
| SECURITY-005 | columns 프로젝션 + 쓰기 검증 | SELECT/INSERT/UPDATE 제한 | — |
