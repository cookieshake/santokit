# Auto CRUD — Spec v1 (Slim)

목표:
- 스키마(=Hub의 DB introspection snapshot)와 권한 설정만으로 기본 CRUD API를 제공한다.
- Bridge(Data Plane)는 “허용된 테이블/컬럼/연산”만 SQL로 생성해 실행한다.

v1 범위(슬림):
- DB 엔진: Postgres only
- 권한 주체: Project API key의 `roles`만 사용 (End User JWT/owner-RLS는 Phase 2+)
- where: 단순 equality(AND)만
- 컬럼 prefix 규칙/owner 기반 RLS/복잡 표현식은 Phase 2+로 미룬다

---

## 1) Endpoint Contract

Bridge는 단일 엔드포인트를 유지한다:
- `POST /call`

Auto CRUD는 `path` 컨벤션으로 라우팅된다:
- `db/{db}/{table}/{op}`
- `op`: `select` | `insert` | `update` | `delete`

예:
```json
{ "path": "db/main/users/select", "params": { "where": { "status": "active" }, "limit": 10 } }
```

---

## 2) Input Params (v1)

공통:
- `where`: object (AND equality로 해석)

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

안전장치(v1, 필수):
- `where` 없는 `update/delete`는 기본적으로 금지

---

## 3) Schema Dependency

Hub(Control Plane)는 `project+env+connection` 스코프에 schema snapshot을 저장한다.
Bridge(Data Plane)는 현재 릴리즈가 가리키는 snapshot을 사용해 다음을 강제한다:
- 테이블/컬럼 존재 여부 검증
- 허용되지 않은 컬럼 접근 차단(예: 존재하지 않는 컬럼, 읽기 전용 컬럼 등)
- 타입 기반 값 검증(가능한 범위)

---

## 4) Permissions Model (v1)

설정 파일(Operator가 GitOps로 관리):
- `config/permissions.yaml`

권한 키워드(v1):
- `{role}` 문자열만 지원 (예: `reader`, `writer`, `admin`)

테이블 레벨 권한:
- `select|insert|update|delete`에 대해 roles 리스트를 지정한다.

예(v1 스케치):
```yaml
tables:
  users:
    select: [reader, writer, admin]
    insert: [writer, admin]
    update: [writer, admin]
    delete: [admin]
  _default:
    select: [reader, writer, admin]
    insert: [writer, admin]
    update: [writer, admin]
    delete: [admin]
```

평가 규칙(v1):
- 요청의 API key roles와 연산(op)에 허용된 roles가 교집합이 없으면 `403`

---

## 5) SQL Safety Rules (v1, 필수)

Bridge는 “사용자 입력 SQL”을 실행하지 않는다.
항상 schema snapshot 기반으로 SQL을 생성하고 파라미터는 바인딩한다.

금지:
- raw SQL 파라미터 주입(문자열 치환)
- 존재하지 않는 컬럼/테이블 참조

