# Auto CRUD (Spec, Draft)

상태:
- v1에서 “스펙은 유지”하되, 구현은 Phase 5로 둔다. (필요하면 당겨서 MVP/Phase 2로 재조정)

목적:
- 스키마만 정의하면 기본 CRUD API를 제공한다.
- 설정 기반 권한 + 컬럼 prefix 기반 민감도 규칙을 자동 적용한다.
- 커스텀 로직이 있으면 자동 CRUD를 오버라이드한다.

---

## 1) Endpoint Contract

Bridge는 단일 엔드포인트만 유지한다:
- `POST /call`

Auto CRUD는 `path` 컨벤션으로 라우팅된다:
- `db/{db}/{table}/{op}`
- `op`: `select` | `insert` | `update` | `delete`

예:
```json
{ "path": "db/main/users/select", "params": { "where": { "status": "active" }, "limit": 10 } }
```

---

## 2) Input Params (Draft)

공통:
- `where`: object (AND 조건으로 해석)

`select`:
- `select`: string[] | "*" (default `"*"`)
- `orderBy`: object (예: `{ created_at: "desc" }`)
- `limit`: number
- `offset`: number

`insert`:
- `data`: object

`update`:
- `data`: object

`delete`:
- (추가 필드 없음)

제약(MVP 안전장치):
- `where` 없는 `update/delete`는 기본적으로 금지(설정으로만 허용)

---

## 3) Schema Dependency

CRUD는 `schema/*.yaml`에서 컴파일된 내부 IR을 사용해 다음을 보장한다:
- 테이블/컬럼 존재 여부 검증
- type 기반 값 검증(가능한 범위)
- 허용되지 않은 컬럼 접근 차단

---

## 4) Permissions Model (Draft)

설정 파일:
- `config/permissions.yaml`

테이블 레벨 권한:
- `select|insert|update|delete`에 대해 role 리스트를 지정
- 키워드: `public`, `authenticated`, `owner`, `{role}`

owner 기반 RLS:
- owner role일 때는 자동으로 row filter를 추가한다.
- `ownerColumn`을 테이블별로 설정한다.

예(스케치):
```yaml
tables:
  users:
    select: [authenticated]
    insert: [public]
    update: [owner, admin]
    delete: [admin]
  _default:
    select: [authenticated]
    insert: [authenticated]
    update: [owner, admin]
    delete: [admin]

ownerColumn:
  _default: user_id
  users: id
```

---

## 5) Column Prefix Rules (Draft)

컬럼명 prefix로 민감도/권한을 자동 적용한다:
- `s_` (Sensitive): owner/admin 중심
- `c_` (Critical): admin only, 기본적으로 결과에서 제외
- `p_` (Private): admin only, 기본적으로 결과에서 제외
- `_` (System): read-only, insert/update 불가(자동 생성)

`select="*"`의 기본 동작:
- `c_`, `p_`는 자동 제외
- `s_`는 요청자 권한이 허용될 때만 포함

---

## 6) Custom Override

기본 규칙:
- 커스텀 로직 파일이 존재하면 자동 CRUD 대신 그 로직을 실행한다.

오버라이드 경로(권장, 명시적):
- `logic/db/{db}/{table}/{op}.sql`
- `logic/db/{db}/{table}/{op}.js`

예:
- `logic/db/main/users/select.sql`이 있으면 `db/main/users/select`를 오버라이드한다.

---

## 7) Engine Notes (Postgres vs sqlite)

CRUD SQL 생성은 엔진별로 다르다:
- Postgres: `RETURNING` 등을 활용 가능
- libsql/D1(sqlite 계열): 기능/문법 지원 수준에 따라 반환 형태가 달라질 수 있음

v1 방향:
- 결과 형태는 가능한 한 정규화하지만, 엔진 제약이 있는 경우 문서로 고정한다.

---

## 8) Open Decisions

1) `where` 표현식 확장 범위:
- 단순 equality만(MVP) vs `and/or`, `in`, `like`, 비교 연산자 지원

2) `select="*"`에서 `s_` 포함 정책:
- owner/admin만 포함 vs role 기반으로 확장

3) sqlite 계열에서 insert 결과:
- `returning` 강제(지원 런타임만) vs 최소 응답(영향 행 수 + id)
