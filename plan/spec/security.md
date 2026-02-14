# Security Spec (Shared Rules)

이 문서는 보안의 공통 규칙만 정의한다.
기능 단위 규범은 `plan/capabilities/security/*.md`를 SoT로 사용한다.

## Shared Rules

- 권한 조건은 정책 파일과 runtime credential 컨텍스트를 함께 평가한다.
- CEL resource 기반 조건은 지원 가능한 패턴만 SQL 필터로 변환한다.
- 컬럼 접근은 role별 허용 목록 기반으로 제한한다.
- 민감정보(토큰/키/DB URL/내부키소재)는 로그에 남기지 않는다.

## Capability Mapping

- `SECURITY-001`: CEL condition 주입
- `SECURITY-002`: CEL literal equality
- `SECURITY-003`: 미지원 CEL 연산자 거부
- `SECURITY-004`: 컬럼 prefix 정책
- `SECURITY-005`: 컬럼 레벨 권한
