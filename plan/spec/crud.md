# Auto CRUD — Spec

목표:
- 스키마(=선언 스키마 YAML)와 권한 설정만으로 기본 CRUD API를 제공한다.
- Bridge(Data Plane)는 “허용된 테이블/컬럼/연산”만 SQL로 생성해 실행한다(사용자 입력 SQL 실행 금지).

범위:
- DB 엔진: Postgres (기본)
- 권한 주체: Project API key roles + End User access token roles/identity
- 권한 모델: 테이블/컬럼 레벨 권한 + **CEL(Common Expression Language) 기반 Condition**
- where: equality + 연산자 객체(`$eq/$ne/$gt/$gte/$lt/$lte/$in/$notIn/$like/$isNull/$isNotNull`)
- 컬럼 접근 제어는 permissions.yaml에서 명시적으로 지정

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
- 논리 연산자(`$and`, `$or`)는 현재 지원하지 않는다.
- `in`/`notIn` 연산자는 비어있지 않은 scalar array 값을 받는다.
- 미지원 연산자/타입은 `400 BAD_REQUEST`로 실패한다(무시하지 않음).

`select`:
- 주의: 여기서 `select`는 `params.select`(반환 컬럼 선택) 필드를 의미하며, `op=select`(조회 연산)와는 별개다.
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

`insert` 응답 형식:
- Bridge는 생성 쿼리에 `RETURNING *`를 사용한다.
- 응답에는 생성된 row(Primary Key 포함)를 반환한다.
- 예:
```json
{"data": {"id": "usr_123", "email": "a@example.com"}}
```

`update`:
- `data`: object

`delete`:
- (추가 필드 없음)

안전장치(필수):
- `where` 없는 `update/delete`는 기본적으로 금지

### 2.1) Array 타입 검증

Insert/Update 시 `type: array` 컬럼의 검증:
- `items` 타입과 모든 배열 요소가 일치해야 함
- 예: `tags: { type: array, items: string }`이면 `["foo", "bar"]`는 허용, `["foo", 123]`은 거부
- 중첩 배열도 재귀적으로 검증
- 빈 배열 `[]`은 허용
- 타입 불일치 시 `400 BAD_REQUEST` 반환

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
- 목적: `posts.user_id` 같은 FK를 기반으로 "관련 row"를 같이 가져온다.
- 전제: 스키마에서 `references`가 선언되어 있어야 한다.
- 허용 범위:
  - 같은 connection 안에서만 허용한다(= cross-DB expand 금지).
  - 1-depth(단일 hop)만 지원한다(중첩 expand는 최종 스펙 범위 밖).
- 권한:
  - expand 대상 테이블에 대한 `select` 권한이 없으면 `403`.
  - 반환 컬럼은 expand 대상 테이블의 column permissions를 동일하게 적용한다.
- 참고:
  - `onDelete/onUpdate`(cascade 등)는 DB 레벨 동작이며, Bridge는 이를 "추가로 구현"하지 않는다.

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
- `public` (Bridge 공통 인증 게이트웨이를 통과한 요청에서 추가 role 제한 없음; 완전 익명 아님)
- `authenticated` (End User access token 필요)
- `{role}` (API key roles 또는 End User roles에 매칭)

**Condition (CEL) - 현재 제한사항**:
- 단순 role 체크를 넘어선 동적 조건을 정의한다.
- 구글 CEL(Common Expression Language) 표준을 사용한다.

지원되는 패턴:
1. **Owner Check (SQL 변환 지원)**:
   - `resource.id == request.auth.sub`
   - `resource.user_id == request.auth.sub`
   - 패턴: `resource.<column> == request.auth.sub`
   - 이 패턴은 SQL WHERE 절로 안전하게 변환됨

2. **Request Context (CEL 평가)**:
   - `request.auth.roles`에 기반한 조건
   - `request.params.*`에 기반한 조건
   - CEL 엔진으로 평가됨 (SQL 변환 없음)

제한사항:
- 일반적인 `resource.*` 조건 (예: `resource.status == "active"`)은 **현재 미지원**
- 향후 릴리즈에서 추가 예정
- 미지원 패턴 사용 시 명확한 에러 메시지 반환

### 4.1) Rule-Based Permissions

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
- `columns`가 **명시된 경우**: 해당 리스트만 허용
  - `["*"]`는 모든 컬럼 허용
- `columns`가 **없는 경우**: 모든 컬럼 허용 (SELECT, INSERT, UPDATE 모두)

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

## 5) Column Access Control

컬럼 접근 제어는 `permissions.yaml`의 rule-level `columns` 필드로만 지정한다.

**명시적 제어**:
컬럼명 prefix에 특별한 의미가 없다. 모든 컬럼 접근 제어는 permissions.yaml에서 명시적으로 정의해야 한다.

```yaml
tables:
  users:
    select:
      - roles: [admin]
        columns: ["*"]                    # 모든 컬럼 허용
      - roles: [authenticated]
        columns: ["id", "name", "email"]  # 제한된 컬럼만
    insert:
      - roles: [authenticated]
        columns: ["name", "email"]        # 명시적으로 허용된 컬럼만
```

- `columns: ["*"]` 또는 `columns` 미지정: 모든 컬럼 허용
- `columns: ["name", "email"]`: 명시된 컬럼만 허용
- 컬럼 제한이 필요하면 반드시 `columns` 필드를 명시해야 한다

연산별 동작 규칙:
- `select`: 요청한 컬럼 중 비허용 컬럼은 응답에서 조용히 제외한다(컬럼 제한만으로 `403`을 반환하지 않음).
- `insert`/`update`: `data`에 비허용 컬럼이 하나라도 포함되면 요청 전체를 `403`으로 거부한다.

---

## 6) SQL Safety Rules (필수)

Bridge는 “사용자 입력 SQL”을 실행하지 않는다.
항상 schema IR 기반으로 SQL을 생성하고 파라미터는 바인딩한다.

금지:
- raw SQL 파라미터 주입(문자열 치환)
- 존재하지 않는 컬럼/테이블 참조
