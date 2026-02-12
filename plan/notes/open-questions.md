# Open Questions

이 문서는 `plan/spec/final.md`에서 분리한 미결정 항목을 모아 둔다.

## Runtime

- Multi-runtime(Workers 등) 지원 범위

## Database

- Postgres 외 DB 엔진 지원 범위

## Schema/Type

- `decimal` 타입의 precision/scale 파라미터 문법을 어떻게 노출할 것인가?
- Native array 타입 최적화(예: Postgres native array 직접 매핑) 범위와 시점
- Cross-DB FK(서로 다른 connection 간 참조) 허용 여부와 제약

## CRUD/Permission

- Where 절 논리 연산자 (`$and`, `$or`) 지원 시점 및 문법
- Nested expand(다단계 FK 확장) 지원 여부와 깊이 제한 정책

## Auth

- End-user 인증 UI(기본 제공 vs 템플릿 제공 vs 완전 비제공)의 제품 범위는 무엇인가?

## Storage/Operations

- Storage credential 관리용 CLI 범위(예: 발급/회전/폐기/권한점검)와 운영 책임 경계는 어디까지인가?

## Bridge ↔ Hub Protocol

- Push 방식(WebSocket/SSE) 도입 시점 및 우선순위
- 멀티 Bridge 인스턴스 간 캐시 일관성 보장 필요 여부

## Operator RBAC

- 커스텀 역할 지원 여부 및 시점
- Org owner 이전 절차
- 2FA/MFA 적용 범위

## Client SDK

- `@santokit/client-core` 런타임 라이브러리의 범위 (HTTP 클라이언트, 인증 자동 갱신, 리트라이)
- Realtime subscription (WebSocket) 지원 시 SDK 확장 방식

## MCP Server

- Resource 노출 여부 (MCP resources vs tools-only)
- Prompt 템플릿 제공 여부 (MCP prompts)
