# Logics Spec (Shared Rules)

이 문서는 custom SQL logic의 공통 규칙만 정의한다.
기능 단위 규범은 `plan/capabilities/logics/*.md`를 SoT로 사용한다.

## Shared Rules

- logic path는 `logics/{name}`.
- 행 반환 쿼리는 `data: [...]`, 실행 전용 쿼리는 `data: { affected: N }`.
- 파라미터 해석 순서: required 확인 -> default 적용 -> 타입 검증 -> SQL 바인딩.
- role/auth 정책은 logic 메타 설정을 따른다.
- 미존재 logic는 `404`, 필수 파라미터 누락/타입 불일치는 `400`.

## Capability Mapping

- `LOGICS-001`: `:auth.sub` 시스템 변수
- `LOGICS-002`: public logic
- `LOGICS-003`: execute-only response
- `LOGICS-004`: required parameter
- `LOGICS-005`: default parameters
- `LOGICS-006`: role guard
- `LOGICS-007`: 오류 처리 시나리오
