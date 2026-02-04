# Auto CRUD — Spec

목표:
- 스키마(=선언 스키마 YAML)와 권한 설정만으로 기본 CRUD API를 제공한다.
- Bridge(Data Plane)는 “허용된 테이블/컬럼/연산”만 SQL로 생성해 실행한다(사용자 입력 SQL 실행 금지).

범위:
- DB 엔진: Postgres (기본)
- 권한 주체: Project API key roles + End User access token roles/identity
- 권한 모델: 테이블/컬럼 레벨 권한 + **CEL(Common Expression Language) 기반 Condition**
- where: equality(AND) + 확장 표현식(and/or/in/like/비교 연산)
- 컬럼 prefix 규칙으로 민감도/기본 노출을 자동 적용

스키마 상세:
- `plan/spec/schema.md`
- 커스텀 로직(`logics/`) 상세: `plan/spec/logics.md`

---

## 1) Endpoint Contract

Bridge는 단일 엔드포인트를 유지한다:
- `POST /call`

Auto CRUD는 `path` 컨벤션으로 라우팅된다:
- `db/{table}/{op}`
- `op`: `select` | `insert` | `update` | `delete`

커스텀 로직:
- `logics/{name}`
- 상세: `plan/spec/logics.md`

예:
```json
{ "path": "db/users/select", "params": { "where": { "status": "active" }, "limit": 10 } }
```

---

## 2) Input Params

공통:
- `where`: object (표현식)

where 확장:
- `in` 연산자는 array 값을 받는다.

`select`:
- `select`: string[] | "*" (default `"*"`)
- `expand`: string[] (optional; FK 기반 관계 로드)
- `orderBy`: object (예: `{ created_at: "desc" }`)
- `limit`: number
- `offset`: number

`insert`:
- `data`: object
  - PK 컬럼(`id.name`)은 기본적으로 입력에서 허용하지 않는다(Bridge가 생성).
    - `generate=auto_increment`면 DB가 생성한다(Bridge는 `RETURNING id` 등으로 값을 회수).
  - 단, 스키마에서 `tables.<name>.id.generate=client`면 입력에서 허용한다.

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
  - `array` 타입이면 “배열 여부 + 요소 타입”을 검증한다.

멀티 connection:
- `path`의 `{table}`을 기준으로 해당 table의 `connection`을 결정하고,
  해당 connection의 `schema_ir`을 선택한다.

관계 로드(`expand`):
- 목적: `posts.user_id` 같은 FK를 기반으로 “관련 row”를 같이 가져온다.
- 전제: 스키마에서 `references`가 선언되어 있어야 한다.
- 허용 범위:
  - 같은 connection 안에서만 허용한다(= cross-DB expand 금지).
  - 1-depth(단일 hop)만 지원한다(중첩 expand는 최종 스펙 범위 밖).
- 권한:
  - expand 대상 테이블에 대한 `select` 권한이 없으면 `403`.
  - 반환 컬럼은 expand 대상 테이블의 column permissions/prefix rules를 동일하게 적용한다.
- 참고:
  - `onDelete/onUpdate`(cascade 등)는 DB 레벨 동작이며, Bridge는 이를 “추가로 구현”하지 않는다.

예:
```json
{
  "path": "db/posts/select",
  "params": {
    "where": { "status": "published" },
    "expand": ["user"],
    "limit": 10
  }
}
```

응답(개념):
- 각 row에 `user` 객체가 포함된다(관계 이름은 `references.as`를 사용, 없으면 기본값은 참조 table명).

---

## 4) Permissions Model

설정 파일(Operator가 GitOps로 관리):
- `config/permissions.yaml`

권한 키워드:
- `public` (인증 없이 허용)
- `authenticated` (End User access token 필요)
- `{role}` (API key roles 또는 End User roles에 매칭)

**Condition (CEL)**:
- 단순 role 체크를 넘어선 동적 조건을 정의한다.
- 구글 CEL(Common Expression Language) 표준을 사용한다.

테이블/컬럼 레벨 권한:
- `select|insert|update|delete`에 대해 허용 주체를 지정한다.
- `columns`로 select/insert/update 가능한 컬럼을 제한할 수 있다.

예(스케치):
```yaml
tables:
  users:
    select:
      roles: [authenticated]
      # 'resource'는 현재 row, 'request.auth'는 토큰 정보를 담는다.
      condition: "resource.id == request.auth.sub"
    insert:
      roles: [public]
    update:
      roles: [authenticated]
      condition: "resource.id == request.auth.sub"
    columns:
      select: ["*", "!c_*", "!p_*"]
      update: ["name", "avatar_url"]
```

멀티 connection 규칙:
- 권한 정책은 table 단위로 평가한다(`tables.<name>`).
- table의 connection은 schema에서 결정한다(= permissions.yaml에 connection을 쓰지 않는다).

평가 규칙:
- `public`: credential 없이 허용
- `authenticated`: End User access token 필요
- `{role}`: API key roles 또는 End User roles에 포함되어야 함
- `condition`: CEL 표현식이 `true`로 평가되어야 함.
  - Bridge는 이를 `WHERE` 절에 주입하여 DB 레벨에서 필터링한다(RLS).

변수(Context):
- `request.auth.sub`: End User ID
- `request.auth.roles`: Role list
- `resource`: 현재 접근하려는 Table의 Row (alias)


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
