# Operator Spec (Shared Rules)

이 문서는 운영 공통 규칙만 정의한다.
기능 단위 규범은 `plan/capabilities/operator/*.md`를 SoT로 사용한다.

## Shared Rules

- 운영 경로는 `stk` CLI를 통해 Hub/Bridge를 제어한다.
- 프로젝트/환경/연결/릴리즈는 선언 상태와 릴리즈 포인터로 관리한다.
- destructive schema 변경은 기본 차단이며 명시적 강제 옵션에서만 허용된다.
- release 승격/롤백은 포인터 이동이며 DB rollback과 구분한다.

## Capability Mapping

- `OPERATOR-001`: bootstrap
- `OPERATOR-002`: API key 운영
- `OPERATOR-003`: schema apply
- `OPERATOR-004`: permissions apply
- `OPERATOR-005`: release promote/rollback
- `OPERATOR-006`: operator RBAC
- `OPERATOR-007`: health/readiness
