# 미구현/불일치 항목 (Plan vs Implementation)

이 문서는 `plan/` 스펙과 `packages/` 구현을 비교해, 아직 미구현이거나 스펙과 불일치하는 항목만 정리한다.

- 갱신일: 2026-02-10

---

## A. 현재 유효한 갭 (우선순위 기준)

### P0 — 스펙과 구현이 직접 충돌

### 1. CRUD `insert` 응답 포맷 불일치
- **Spec (`plan/spec/crud.md`)**: `insert`는 생성 row를 반환 (`{"data": {...}}`, `RETURNING *` 기반)
- **구현 상태**: Bridge는 `ids`/`generated_id` 형태를 반환
- **영향**: 문서 기반 SDK/클라이언트 구현 시 응답 파싱 불일치
- **근거 코드**: `packages/services/bridge/src/handlers/call.rs`

### 2. `stk release rollback` CLI 플래그 불일치
- **Spec (`plan/spec/cli.md`)**: `stk release rollback --to-release-id <releaseId>`
- **구현 상태**: CLI는 `--to` 플래그 사용
- **영향**: 운영자 문서대로 실행 시 커맨드 실패 가능
- **근거 코드**: `packages/tools/cli/src/main.rs`

---

### P1 — 명시된 기능 미구현

### 3. `resource.*` 일반 CEL 조건 SQL 변환 미구현
- **Spec (`plan/spec/crud.md`)**: 일반 `resource.*` 조건 확장 방향 제시
- **구현 상태**: owner-check 패턴 외 `resource.*`는 에러 반환
- **근거 코드**: `packages/libs/core/src/permissions/evaluator.rs`

### 4. 배열(`type: array`) 재귀 타입 검증 미구현
- **Spec (`plan/spec/crud.md`)**: Insert/Update 시 `items` 기준 재귀 검증
- **구현 상태**: CRUD 경로에서 스키마 기반 배열 요소 재귀 검증 부재
- **근거 코드**: `packages/services/bridge/src/handlers/call.rs`

### 5. PK 재정의 방지 검증 미구현
- **Spec (`plan/spec/schema.md`)**: `id` 컬럼의 `columns` 중복 정의 금지
- **구현 상태**: 파서에 명시적 검증 로직 부재
- **근거 코드**: `packages/libs/core/src/schema/parser.rs`

### 6. `stk connections rotate` 미구현
- **Spec (`plan/secrets/model.md`)**: 회전 명령 정의
- **구현 상태**: `set/test/list`만 존재
- **근거 코드**: `packages/tools/cli/src/main.rs`, `packages/tools/cli/src/commands/connections.rs`

### 7. `stk connections show` 미구현
- **Spec (`plan/secrets/model.md`)**: 단건 조회 명령 정의
- **구현 상태**: `show` 서브커맨드 없음
- **근거 코드**: `packages/tools/cli/src/main.rs`, `packages/tools/cli/src/commands/connections.rs`

### 8. PASETO `kid` 헤더 발급 미구현
- **Spec (`plan/spec/auth.md`)**: 토큰 키 식별용 `kid` 요구
- **구현 상태**: access token 발급 시 `kid` 헤더 설정 코드 부재
- **근거 코드**: `packages/services/hub/src/main.rs` (`issue_access_token`)

---

### P2 — 성능/운영성 개선 필요

### 9. `file onDelete: cascade` 처리 동기 실행
- **Spec (`plan/spec/storage.md`)**: Best-effort 비동기 삭제
- **구현 상태**: delete 경로에서 S3 삭제를 요청 처리 흐름에서 `await`
- **영향**: API 지연 증가 가능
- **근거 코드**: `packages/services/bridge/src/handlers/call.rs`

### 10. End User role 변경 전파 전략 미흡
- **Spec (`plan/spec/auth.md`)**: role 변경 시 토큰 재발급/짧은 TTL 등 운영 전략 필요
- **구현 상태**: refresh revoke는 있으나 role 변경 즉시 반영 정책은 불명확
- **근거 코드**: `packages/services/hub/src/main.rs`

---

## B. 이전 문서에서 제거/하향된 항목 (현재는 해결 또는 스펙화 완료)

- `stk apply --only permissions,release` 조합: **지원됨**
- `stk apply` releaseId 재사용(idempotency): **구현됨** (`find_release_by_hash`)
- 드리프트 시 release 차단: **구현됨**
- 멀티프로젝트 쿠키 네임스페이스 선택: **구현됨**
- Storage `delete` 권한/동작 경로: **구현됨**
- `release promote/rollback` 명령 자체 부재: **해결됨** (단, rollback 플래그 네이밍은 스펙 불일치)

---

## C. Open Questions로 관리하는 것이 맞는 항목 (미구현 리스트에서 분리)

아래는 "구현 누락"보다 "결정 미완료" 성격이 강하므로 `plan/notes/open-questions.md`에서 관리한다.

- `bytes` JSON 직렬화 포맷
- `decimal` precision/scale 표기 문법
- native array 최적화 범위
- cross-DB FK
- nested expand
- `resource.*` 일반 CEL의 범위/시점(로드맵 관점)
