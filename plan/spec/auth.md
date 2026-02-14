# Auth Spec (Shared Rules)

이 문서는 인증의 공통 규칙만 정의한다.
기능 단위 규범은 `plan/capabilities/auth/*.md`를 SoT로 사용한다.

## Shared Rules

- End-user access token은 Hub가 발급하고 Bridge가 검증한다.
- 컨텍스트 우선순위는 `API key > Bearer > namespaced cookie`를 따른다.
- credential의 project/env 바인딩이 라우팅 힌트와 다르면 `403`.
- credential이 없으면 `401`.
- 토큰/키/DB URL 등 민감정보는 로그에 남기지 않는다.

## Capability Mapping

- `AUTH-001`: Hub issuer signup/login + Bridge 사용
- `AUTH-002`: OIDC provider 설정/등록
- `AUTH-003`: 멀티 프로젝트 컨텍스트 격리
- `AUTH-004`: 명시적 OIDC linking
