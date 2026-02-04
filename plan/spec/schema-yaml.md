# Schema YAML Spec (MVP)

목적:
- `schema/*.yaml`을 Santokit의 스키마 Source of Truth로 정의한다.
- CLI는 로컬에서 **검증(validate)** 할 수 있어야 한다.
- Hub-less 전제에서 **CLI(또는 CI)** 가 BYO DB에 직접 연결하여 **plan/apply**를 수행한다.

대상 DB 엔진:
- Postgres
- libsql / Cloudflare D1 (SQLite 계열)

---

## 1) Files & CLI Behavior

### Files
- `schema/main.yaml` (MVP 기본 파일, `stk init`이 생성)
- 추후 확장: `schema/*.yaml` 여러 파일을 merge (MVP에서는 1개 파일만 허용해도 됨)

### CLI
- `stk init`
  - `schema/main.yaml` 생성(최소 1개 테이블 예시 포함)
- `stk schema validate`
  - 로컬에서 YAML 파싱 + 규칙 검증
  - 엔진별 컴파일이 가능해야 함(최소: DDL 생성까지)
- `stk schema plan`
  - CLI가 DB introspection을 수행하고 “현재 DB 상태 vs 목표 스키마” diff를 계산
- `stk schema apply`
  - CLI(또는 CI)가 BYO DB에 직접 연결하여 변경 적용

---

## 2) YAML Top-Level Shape (Draft)

MVP에선 “명시적 + 단순”이 목표라 아래 구조를 추천한다.

```yaml
version: 1

database:
  # BYO DB 연결은 secrets/config로 관리한다. 여긴 "스키마 엔진" 선언용.
  engine: postgres # postgres | sqlite

tables:
  users:
    primary_key: [id]
    columns:
      id:
        type: string
        nullable: false
      email:
        type: string
        nullable: false
        unique: true
      created_at:
        type: timestamp
        nullable: false
        default: now
    indexes:
      - columns: [email]
        unique: true
```

---

## 3) Logical Types (MVP)

목표: Postgres/SQLite 둘 다로 컴파일 가능한 공통 타입 집합.

- `string`
- `int`
- `bigint`
- `float`
- `boolean`
- `json`
- `timestamp` (UTC 기준, 엔진별 표현 다름)
- `bytes`

엔진별 매핑(초안):
- Postgres:
  - `string` → `text` (또는 `varchar`는 추후)
  - `json` → `jsonb`
  - `timestamp` → `bigint` (Unix epoch milliseconds, UTC)
- SQLite/libsql/D1:
  - `string` → `text`
  - `json` → `text` (또는 json1 활용은 추후)
  - `timestamp` → `integer` (Unix epoch milliseconds, UTC)

---

## 4) Defaults (MVP)

default는 “logical default”로 정의하고 엔진별로 컴파일한다.

허용 값(초안):
- `now`:
  - 의미: “현재 시각(UTC)”
  - `timestamp`가 epoch milliseconds로 고정이므로 엔진별 컴파일은 다음을 권장한다.
  - Postgres: `floor(extract(epoch from now()) * 1000)::bigint`
  - SQLite: `(CAST(strftime('%s','now') AS integer) * 1000)`

ID 생성 default (MVP, string 전용):
- `gen_uuidv7`
  - 의미: UUIDv7 문자열 생성
  - 결과 타입: `string`
  - MVP 정책: **app-generated** (DB default로는 기본 비활성)
  - 이유: Postgres/SQLite 모두 “표준 내장”이 아니어서, DB 레벨 의존/확장 설치를 MVP에서 강제하지 않기 위함

- `gen_typeid`
  - 의미: typeid 스타일 문자열 생성 (예: `user_...`)
  - 결과 타입: `string`
  - MVP 정책: **app-generated**
  - prefix 규칙(결정, 2026-02-04): **테이블명 기반 자동 prefix**
    - 예: `tables.users`의 `id`면 prefix는 `user`
    - 구체 규칙(초안): table name의 마지막 토큰을 단수화하는 단순 규칙(Phase 2에서 고도화)

금지(명시):
- `gen_random_uuid` (uuid 타입 미지원 + Postgres v4 UUID에 결합되므로 MVP에서 금지)

---

## 5) Validation Rules (MVP)

로컬 `stk schema validate`에서 반드시 잡아야 하는 것:
- YAML 파싱 실패
- `version` 누락/지원하지 않는 값
- `database.engine` 누락/미지원 값
- 테이블/컬럼 이름 규칙(허용 문자/길이; MVP에선 `[a-zA-Z_][a-zA-Z0-9_]*` 정도)
- `primary_key`가 존재하지 않는 컬럼을 참조
- 컬럼 type이 logical type 집합에 없음
- `nullable=false` + `default` 충돌/불가 조합(엔진별)
- `uuid` 타입 사용 (MVP에서 금지)
- `gen_random_uuid` default 사용 (MVP에서 금지)
- `gen_uuidv7` / `gen_typeid`는 `type: string`에서만 허용
- DB 엔진이 `sqlite`인 경우, `default: gen_uuidv7|gen_typeid`는 “app-generated”임을 경고(또는 info)로 표기

---

## 6) Plan/Apply Mechanics (MVP)

현실적인 MVP 구현 순서:
1) CLI/CI: DB introspection (tables/columns/indexes) 최소 구현
2) CLI/CI: 목표 스키마(YAML → IR)와 비교해 “생성/변경/삭제” 목록 도출
3) MVP에선 “안전한 subset”만 apply:
   - create table
   - add column (nullable true or with default)
   - create index
4) destructive change(drop/rename/type change)는 plan에서 경고만 하고 apply는 막는다(Phase 2로 이관)

---

## 7) Open Decisions

결정(2026-02-04):
- `timestamp`는 모든 엔진에서 **integer(epoch milliseconds)** 로 고정한다.

2) 다중 DB alias 지원을 MVP에 넣을까?
- 예: `[databases.main] engine=...` + 테이블별 database 할당

3) 테이블/컬럼 rename을 지원할까?
- 명시적 `renames` 섹션이 필요(없으면 diff가 drop+create로 보임)
