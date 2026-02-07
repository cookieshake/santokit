# Flow 13 — End User: CEL Condition 기반 WHERE 주입

목표:
- `permissions.yaml`의 CEL `condition`이 실제 SQL WHERE 절로 올바르게 주입되는지 검증한다.
- 데이터 소유자(`resource.id == request.auth.sub`) 기반의 접근 제어를 확인한다.

---

## A. 환경 설정

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

## B. 사용자 시나리오

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
