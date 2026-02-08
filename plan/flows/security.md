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

## Flow 14 — Column Prefix Rules 검증

목표:
- 컬럼 명명 규칙(`c_`, `p_`, `s_`, `_`)에 따른 자동 동작을 검증한다.

전제:
- `schema/users.yaml`에 다양한 prefix를 가진 컬럼을 정의한다.
- `permissions.yaml`은 기본 설정(`select: ["*"]`)을 사용하거나 테스트 목적에 맞게 조정한다.

---

### A. 환경 설정

1) `users` 테이블 스키마:
   - `c_secret`: Critical (Admin only, default exclude)
   - `p_private`: Private (Admin only, default exclude)
   - `s_sensitive`: Sensitive (Included in select *)
   - `_system`: System (Read-only)
   - `normal`: Normal

2) 데이터:
   - 테스트용 레코드 1건 삽입

---

### B. 테스트 시나리오

1) **SELECT * 동작 검증**:
   - `select` 파라미터 없이 호출 (또는 `*`).
   - 결과에 `normal`, `s_sensitive`는 포함되어야 한다.
   - 결과에 `c_secret`, `p_private`는 **제외**되어야 한다. (Schema/Builder 레벨 필터링)

2) **Explicit SELECT 검증 (c_, p_)**:
   - `select=["c_secret"]` 호출.
   - 권한 설정상 허용된다면 조회 가능해야 한다. (Bridge가 허용 여부 확인)
   - *참고: "Admin only"가 권한 정책으로 강제되는지, 아니면 코드 레벨에서 차단되는지 확인.*

3) **System Column 쓰기 방지**:
   - `insert` 또는 `update`로 `_system` 컬럼 수정 시도.
   - **400 Bad Request** 등으로 거부되어야 한다. (Bridge 레벨 강제)

4) **Sensitive Column 동작**:
   - `s_sensitive`는 `select *`에 포함됨을 확인.

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

1. **columns.select 제한**: `["*", "!c_*"]` → c_ssn SELECT 시 403
2. **columns.update 제한**: `["name", "avatar_url"]` → email UPDATE 시 403, name UPDATE는 성공
3. **columns.insert 제한**: `["name", "email", "avatar_url", "bio"]` → c_ssn INSERT 시 403
4. 제한 없는 컬럼은 정상 동작
5. 와일드카드 패턴 동작 확인
