# CRUD Capability Guide

이 도메인은 Bridge의 data-plane SQL 계층이 제공하는 데이터 접근 계약 전체를 다룬다.
모든 capability는 `POST /call` 엔드포인트를 통해 Bridge에 도달하며, Bridge는 릴리즈 스냅샷의
스키마 IR과 권한 정책을 참조하여 SQL을 생성·실행한다. Hub는 런타임에 관여하지 않는다.

## 흐름 및 의존 관계

CRUD-001이 insert/select 기본 계약을 확립한다. 이후 모든 capability는 CRUD-001에 의존한다.
즉, 기본 계약이 동작하지 않으면 나머지는 테스트할 수 없다.

### 1단계 — 기본 계약: `CRUD-001`

Bridge가 `db/{table}/{op}` 경로를 파싱하고 스키마 IR에서 테이블·컬럼 유효성을 검증한다.
insert는 ID 생성 정책을 적용하고, select는 권한 필터와 where 검증을 거친 뒤 SQL을 실행한다.
이 계약이 성립해야 Security 도메인의 row/column 필터링도 검증할 수 있다.

- [`CRUD-001`](CRUD-001-basic.md) — insert/select 기본 계약 및 ID 생성 정책

### 2단계 — 안전 변형: `CRUD-002`

update/delete는 의도치 않은 전체 테이블 변형을 방지하기 위한 안전장치가 포함된다.
where 없이 전체를 변형하려는 시도는 명시적으로 거부되거나 별도 flag가 필요하다.

- [`CRUD-002`](CRUD-002-advanced.md) — 안전장치 포함 update/delete

### 3단계 — 관계 조회 확장: `CRUD-003`

선언된 FK 관계를 `expand` 파라미터로 단일 요청에서 조회한다. Bridge가 relation 메타데이터를
검증하고 관계 인식 쿼리를 실행한 뒤 결과를 중첩 객체로 직렬화한다.
expand된 관련 테이블에도 동일한 권한·컬럼 필터가 적용된다.

- [`CRUD-003`](CRUD-003-expand.md) — FK relation expand 조회

### 4단계 — 결과 제어: `CRUD-004`

`orderBy`, `limit`, `offset` 파라미터로 select 결과의 정렬 순서와 페이지 범위를 제어한다.
이 capability는 CRUD-001의 select 계약 위에서만 의미가 있다.

- [`CRUD-004`](CRUD-004-pagination-sorting.md) — 정렬·페이지네이션

### 5단계 — 타입 검증: `CRUD-005`

array 타입 컬럼에 쓰기 시 Bridge가 item 타입을 스키마 선언(`items` 계약)에 따라 검증한다.
타입 불일치는 SQL 실행 전에 차단되어 부분 변형을 방지한다.

- [`CRUD-005`](CRUD-005-array-validation.md) — array 컬럼 item 타입 검증

## 컴포넌트 경계 요약

CRUD 도메인의 모든 capability는 Bridge(data-plane)와 SQL 계층에서 실행된다.
Hub는 릴리즈 스냅샷을 제공하는 역할만 하고, 런타임 요청 처리에는 참여하지 않는다.

| Capability | Bridge | SQL 계층 | Hub |
|---|---|---|---|
| CRUD-001 | 경로 파싱·권한 검증 | insert/select 실행 | 릴리즈 스냅샷 제공 |
| CRUD-002 | 안전장치 적용 | update/delete 실행 | — |
| CRUD-003 | relation 검증·중첩 직렬화 | 관계 쿼리 실행 | — |
| CRUD-004 | 파라미터 검증 | 정렬·범위 SQL 생성 | — |
| CRUD-005 | item 타입 사전 검증 | 검증 통과 후 실행 | — |
