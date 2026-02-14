# Operator Capability Guide

이 문서는 기존 operator flow 서사를 capability 기준으로 정리한 가이드다.
구현/검증 기준은 각 capability 문서를 따른다.

## Bootstrap

- 프로젝트/환경/연결 설정 후 첫 적용까지 수행
- Capability: `OPERATOR-001`

## API Key Operations

- 생성/조회/폐기 및 data-plane 호출 검증
- Capability: `OPERATOR-002`

## Apply Schema

- 스키마 변경 계획/적용
- Capability: `OPERATOR-003`

## Apply Permissions

- 권한 정책 반영과 릴리즈
- Capability: `OPERATOR-004`

## Release Promotion/Rollback

- env 간 release 포인터 이동 및 복구
- Capability: `OPERATOR-005`

## Operator RBAC

- 초대/역할 변경/제거
- Capability: `OPERATOR-006`

## Health/Readiness

- Hub/Bridge 상태 확인
- Capability: `OPERATOR-007`
