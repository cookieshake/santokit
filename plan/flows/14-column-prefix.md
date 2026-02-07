# Flow 14 — Column Prefix Rules 검증

목표:
- 컬럼 명명 규칙(`c_`, `p_`, `s_`, `_`)에 따른 자동 동작을 검증한다.

전제:
- `schema/users.yaml`에 다양한 prefix를 가진 컬럼을 정의한다.
- `permissions.yaml`은 기본 설정(`select: ["*"]`)을 사용하거나 테스트 목적에 맞게 조정한다.

---

## A. 환경 설정

1) `users` 테이블 스키마:
   - `c_secret`: Critical (Admin only, default exclude)
   - `p_private`: Private (Admin only, default exclude)
   - `s_sensitive`: Sensitive (Included in select *)
   - `_system`: System (Read-only)
   - `normal`: Normal

2) 데이터:
   - 테스트용 레코드 1건 삽입

---

## B. 테스트 시나리오

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
