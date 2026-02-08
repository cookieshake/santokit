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

### 4.1) Defaults Section

전역 기본값을 커스터마이징할 수 있다:

```yaml
defaults:
  select_star_exclude: ["c_*", "p_*"]    # SELECT * 시 자동 제외할 컬럼 패턴
  readonly_prefixes: ["_*"]               # insert/update 불가 컬럼 패턴
```

- `select_star_exclude`: `select: ["*"]` 또는 명시하지 않았을 때 기본적으로 제외할 컬럼 패턴 (glob 지원)
- `readonly_prefixes`: insert/update 작업에서 허용하지 않을 컬럼 패턴 (glob 지원)

이 값들을 설정하지 않으면 시스템 기본값이 적용된다 (Section 5 참조).

### 4.2) Rule-Based Permissions

각 operation(`select|insert|update|delete`)에 대해 **ordered rule array**를 정의한다:

```yaml
tables:
  users:
    select:
      - roles: [admin]
        columns: ["*"]                    # admin은 모든 컬럼 접근
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["id", "name", "email", "avatar_url"]  # 일반 사용자는 제한된 컬럼만
    insert:
      - roles: [authenticated]
        columns: ["name", "email", "avatar_url"]
    update:
      - roles: [admin]
        columns: ["*"]
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["name", "avatar_url"]
    delete:
      - roles: [admin]
```

**Rule 구조**:
- `roles`: string[] (필수) - 이 규칙이 적용될 role 목록
- `condition`: string (선택) - CEL 표현식으로 추가 조건 명시
- `columns`: string[] (선택) - 접근 가능한 컬럼 목록

**평가 규칙 (First Role Match Wins)**:
1. 배열을 위에서 아래로 순회한다.
2. 요청자의 role이 rule의 `roles`에 포함되면 해당 rule을 적용한다.
3. `condition`이 있으면 CEL 표현식을 평가한다 (`true`여야 허용).
4. 첫 번째로 매칭된 rule을 적용하고 평가를 중단한다.
5. 매칭되는 rule이 없으면 접근 거부 (`403`).

**Columns 필드 동작**:
- `columns`가 **명시된 경우**: 해당 리스트만 허용 (prefix 기본값 무시)
  - `["*"]`는 모든 컬럼 허용 (prefix 기본값도 무시)
- `columns`가 **없는 경우**: `defaults.select_star_exclude` 적용 (select) 또는 스키마의 모든 컬럼 허용 (insert/update, readonly_prefixes 제외)

**하위 호환 (Shorthand)**:
단일 object 형식도 지원 (배열 없이 작성 가능):

```yaml
tables:
  posts:
    select:
      roles: [public]
```

이는 다음과 동등하다:
```yaml
tables:
  posts:
    select:
      - roles: [public]
```

멀티 connection 규칙:
- 권한 정책은 table 단위로 평가한다(`tables.<name>`).
- table의 connection은 schema에서 결정한다(= permissions.yaml에 connection을 쓰지 않는다).

변수(Context):
- `request.auth.sub`: End User ID
- `request.auth.roles`: Role list
- `resource`: 현재 접근하려는 Table의 Row (alias)


---

## 5) Column Prefix Rules

컬럼명 prefix로 민감도/기본 노출을 자동 적용한다:

**지원하는 Prefix**:
- `c_` (Critical): 기본적으로 SELECT * 결과에서 제외, 명시적 컬럼 리스트에서만 접근 가능
- `p_` (Private): 기본적으로 SELECT * 결과에서 제외, 명시적 컬럼 리스트에서만 접근 가능
- `_` (System/Internal): read-only, insert/update 작업에서 허용하지 않음 (자동 생성/관리 컬럼)

**기본 동작**:

`SELECT` 작업:
- `select: ["*"]` 또는 컬럼 명시 없음: `defaults.select_star_exclude` 패턴 적용
  - 시스템 기본값: `["c_*", "p_*"]` 제외
- rule-level `columns`가 명시된 경우: prefix 기본값 **완전 대체** (merge 아님)
  - `columns: ["*"]`: 모든 컬럼 포함 (prefix 제외 규칙 무시)
  - `columns: ["id", "name", "c_secret"]`: 명시된 컬럼만 접근 (`c_secret` 포함 가능)

`INSERT/UPDATE` 작업:
- `defaults.readonly_prefixes` 패턴은 항상 거부됨
  - 시스템 기본값: `["_*"]` 패턴
- rule-level `columns`가 없으면: 스키마의 모든 컬럼 허용 (readonly 제외)
- rule-level `columns`가 있으면: 명시된 컬럼만 허용 (readonly는 여전히 거부)

**커스터마이징**:

`defaults` 섹션으로 기본값을 변경할 수 있다:

```yaml
defaults:
  select_star_exclude: ["p_*", "internal_*"]  # c_* 포함, p_* 및 internal_* 제외
  readonly_prefixes: ["_*", "sys_*"]          # _ 및 sys_ prefix는 insert/update 불가

tables:
  users:
    select:
      - roles: [public]
        # columns 없음 → defaults.select_star_exclude 적용
      - roles: [admin]
        columns: ["*"]  # 모든 컬럼 (p_*, internal_* 포함)
    insert:
      - roles: [authenticated]
        columns: ["name", "email"]  # _created_at, sys_version 자동 거부
```

**중요**: `s_` prefix는 제거되었다. Role별로 다른 컬럼 접근을 허용하려면 rule-level `columns`를 사용한다.

---

## 6) SQL Safety Rules (필수)

Bridge는 “사용자 입력 SQL”을 실행하지 않는다.
항상 schema IR 기반으로 SQL을 생성하고 파라미터는 바인딩한다.

금지:
- raw SQL 파라미터 주입(문자열 치환)
- 존재하지 않는 컬럼/테이블 참조
