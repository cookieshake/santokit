# Auto CRUD — Spec

목표:
- 스키마(=선언 스키마 YAML)와 권한 설정만으로 기본 CRUD API를 제공한다.
- Bridge(Data Plane)는 “허용된 테이블/컬럼/연산”만 SQL로 생성해 실행한다(사용자 입력 SQL 실행 금지).

범위:
- DB 엔진: Postgres (기본)
- 권한 주체: Project API key roles + End User access token roles/identity
- 권한 모델: 테이블/컬럼 레벨 권한 + owner 기반 RLS
- where: equality(AND) + 확장 표현식(and/or/in/like/비교 연산)
- 컬럼 prefix 규칙으로 민감도/기본 노출을 자동 적용

스키마 상세:
- `plan/spec/schema.md`

---

## 1) Endpoint Contract

Bridge는 단일 엔드포인트를 유지한다:
- `POST /call`

Auto CRUD는 `path` 컨벤션으로 라우팅된다:
- `db/{table}/{op}`
- `op`: `select` | `insert` | `update` | `delete`

예:
```json
{ "path": "db/users/select", "params": { "where": { "status": "active" }, "limit": 10 } }
```

---

## 2) Input Params

공통:
- `where`: object (표현식)

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

안전장치(필수):
- `where` 없는 `update/delete`는 기본적으로 금지

---

## 3) Schema Dependency

Hub(Control Plane)는 선언 스키마(YAML)를 파싱/검증해 `schema_ir`을 생성한다.
Bridge(Data Plane)는 현재 릴리즈가 가리키는 `schema_ir`을 사용해 다음을 강제한다:
- 테이블/컬럼 존재 여부 검증
- 허용되지 않은 컬럼 접근 차단(예: 존재하지 않는 컬럼, 읽기 전용 컬럼 등)
- 타입 기반 값 검증(가능한 범위)

멀티 connection:
- `path`의 `{table}`을 기준으로 해당 table의 `connection`을 결정하고,
  해당 connection의 `schema_ir`을 선택한다.

---

## 4) Permissions Model

설정 파일(Operator가 GitOps로 관리):
- `config/permissions.yaml`

권한 키워드:
- `public` (인증 없이 허용)
- `authenticated` (End User access token 필요)
- `owner` (End User `sub` 기반)
- `{role}` (API key roles 또는 End User roles에 매칭)

테이블/컬럼 레벨 권한:
- `select|insert|update|delete`에 대해 허용 주체를 지정한다.
- `columns`로 select/insert/update 가능한 컬럼을 제한할 수 있다.

예(스케치):
```yaml
tables:
  users:
    select: [authenticated]
    insert: [admin]
    update: [owner, admin]
    delete: [admin]
    columns:
      select: ["*", "!c_*", "!p_*"]
      update: ["name", "avatar_url"]
  _default:
    select: [authenticated]
    insert: [admin]
    update: [owner, admin]
    delete: [admin]

ownerColumn:
  _default: user_id
  users: id
```

멀티 connection 규칙:
- 권한 정책은 table 단위로 평가한다(`tables.<name>`).
- table의 connection은 schema에서 결정한다(= permissions.yaml에 connection을 쓰지 않는다).

평가 규칙:
- `public`: credential 없이 허용
- `authenticated`: End User access token 필요
- `{role}`: API key roles 또는 End User roles에 포함되어야 함
- `owner`: End User access token 필요 + ownerColumn 기반 row filter 강제

`ownerColumn`:
- `ownerColumn`에서 테이블별 “소유자 컬럼”을 정의한다.
  - `_default`는 프로젝트 기본값이다.
  - 예: `ownerColumn.users: id`면, `users` 테이블은 `id = <endUserSub>` 조건이 강제된다.

토큰 주의:
- End User roles는 “Santokit 발급 access token”에서 읽는 것을 기준으로 한다(외부 OIDC 토큰 직접 사용 X).

주의:
- API key 기반 호출은 “서버/서비스용”으로 권장한다(End User identity가 없으므로 owner를 만족할 수 없음).

---

## 5) Column Prefix Rules

컬럼명 prefix로 민감도/기본 노출을 자동 적용한다:
- `s_` (Sensitive): owner/admin 중심
- `c_` (Critical): admin only, 기본적으로 결과에서 제외
- `p_` (Private): admin only, 기본적으로 결과에서 제외
- `_` (System): read-only, insert/update 불가(자동 생성)

`select="*"`의 기본 동작:
- `c_`, `p_`는 자동 제외
- `s_`는 요청자 권한이 허용될 때만 포함

---

## 6) SQL Safety Rules (필수)

Bridge는 “사용자 입력 SQL”을 실행하지 않는다.
항상 schema IR 기반으로 SQL을 생성하고 파라미터는 바인딩한다.

금지:
- raw SQL 파라미터 주입(문자열 치환)
- 존재하지 않는 컬럼/테이블 참조
