# Security Flows

## Flow 13 — End User: CEL Condition 기반 WHERE 주입

목표:
- `permissions.yaml`의 CEL `condition`이 실제 SQL WHERE 절로 올바르게 주입되는지 검증한다.
- 데이터 소유자(`resource.id == request.auth.sub`) 기반의 접근 제어를 확인한다.

---

### A. 환경 설정

1) `users` 테이블 정의 (`generate: client` 전략 사용)
2) `permissions.yaml`에 CEL 조건 설정:
   ```yaml
   tables:
     users:
       select:
         roles: [authenticated]
         condition: "resource.id == request.auth.sub"
   ```

---

### B. 사용자 시나리오

1) **사용자 가입 및 로그인**:
   - 사용자 A와 사용자 B가 각각 가입하고 토큰을 획득한다.
2) **데이터 준비**:
   - 사용자 A는 본인의 `sub`를 ID로 하여 레코드를 생성한다.
   - 사용자 B도 본인의 `sub`를 ID로 하여 레코드를 생성한다.
3) **조회 검증 (WHERE 주입)**:
   - 사용자 A가 전체 조회를 요청하면, 본인의 레코드 1개만 조회되어야 한다. (조건 주입 확인)
   - 사용자 A가 사용자 B의 ID를 명시하여 조회를 시도해도 결과가 비어있어야 한다. (강제 필터링 확인)
4) **수정 검증**:
   - 사용자 A가 사용자 B의 레코드 수정을 시도하면 영향받은 행이 0이어야 한다.

---

## Flow 14 — Explicit Column Permissions (API Key Role 기반)

목표:
- 컬럼명 prefix 규칙 없이, `permissions.yaml`의 `columns` 지정만으로 컬럼 접근이 제어되는지 검증한다.

전제:
- `permissions.yaml`에 role별 컬럼 접근 규칙이 정의되어 있다.
- `admin`은 전체 컬럼 조회 가능, `viewer`는 제한된 컬럼만 조회 가능.

---

### A. 환경 설정

1) `users` 테이블 스키마를 적용한다.
2) `permissions.yaml` 예시:
   - `select`: `admin -> ["*"]`, `viewer -> ["id", "normal", "s_sensitive"]`
   - `insert/update/delete`: `admin`만 허용
3) admin/viewer API key를 발급한다.

---

### B. 테스트 시나리오

1) **Admin insert/select 성공**:
   - admin key로 insert 후 select를 호출하면 성공해야 한다.
2) **Viewer select 제한 검증**:
   - viewer key로 동일 row를 select하면 정책상 허용된 컬럼만 반환되거나, 정책 미충족이면 `403`이어야 한다.
3) **Viewer write 차단**:
   - viewer key로 insert/update/delete 시도 시 `403`이어야 한다.

---

## Flow 16 — Column-Level Permissions

목적:
permissions.yaml의 columns 섹션을 통해 정책 레벨에서 컬럼 접근을 제한하는 기능을 검증한다.

전제조건:
- 프로젝트/환경/DB 연결 완료
- 스키마에 users 테이블 (id, name, email, avatar_url, c_ssn, bio 컬럼)
- permissions.yaml에 columns 제한 설정

---

### 시나리오

1. **columns.select 제한**: 기본 role의 select는 정책에 정의된 컬럼만 반환
2. **columns.update 제한**: `["name", "avatar_url"]` → email UPDATE 시 403, name UPDATE는 성공
3. **columns.insert 제한**: `["name", "email", "avatar_url", "bio"]` → c_ssn INSERT 시 403
4. admin role의 select는 전체 컬럼(또는 정책상 허용 컬럼)을 반환
5. 와일드카드 prefix 패턴(`!c_*`)은 사용하지 않는다
