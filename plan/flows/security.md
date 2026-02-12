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

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: permissions 설정 + 호출 예시(헤더/바디) 1개 이상 제시
- 성공 기준: 기대 상태코드와 핵심 응답 필드 제시
- 실패 기준: 최소 1개 부정 케이스와 기대 에러코드 제시

---
---

# Security Notes (v0)

이 문서는 v0에서 반드시 지켜야 할 보안 규칙만 요약한다.

Non-goals (v0 범위 밖):
- 이벤트/크론/DLQ/PubSub 기반 실행 컨텍스트
- 감사 로그/메트릭/알림/대응 플레이북에 대한 별도 스펙

## 1) 토큰/용어

- End User access token은 Santokit이 발급한 access token이다(JWT를 전제로 하지 않는다).
- 요청 컨텍스트 확정/우선순위는 `plan/spec/auth.md`를 따른다.

## 2) 민감정보 비노출 (필수)

로그/트레이스에 남기지 않는다:
- access token 값, refresh token 값
- API key 값
- service token 값
- DB URL/비밀번호 등 연결정보
- `/internal/keys` 응답의 키 소재(`k`)

`/internal/keys/*`는 request/response body 로깅/트레이싱에서 제외한다:
- 상세 규칙: `plan/spec/bridge-hub-protocol.md`

## 3) 내부 API 보호 (필수)

- `/internal/*`는 네트워크 격리 + service token 인증을 전제로 한다.
- service token 회전 절차는 `plan/spec/bridge-hub-protocol.md`를 따른다.

## 4) DoS 안전장치 (필수)

Bridge는 최소 하드 캡을 강제한다:
- rate limit
- 요청 크기 제한
- query timeout
- 최대 결과 행 수 제한
- FK expand depth 제한(1)

## 5) 파괴적 변경 (필수)

- schema apply에서 destructive 변경은 기본 차단, `--force`로만 허용한다.
- schema rollback(다운 마이그레이션)은 지원하지 않는다(Forward-only).
- 상세: `plan/spec/schema.md`

## 6) 최소 테스트 체크

- `/internal/keys` 응답 body가 로그/트레이스에 남지 않는지 확인한다.
- 잘못된/누락된 credential 요청이 401/403으로 실패하는지 확인한다.
- `--force` 없이 destructive 변경이 거부되는지 확인한다.
