# Open Questions

이 문서는 `plan/spec/final.md`에서 분리한 미결정 항목을 모아 둔다.

## Runtime

- Multi-runtime(Workers 등) 지원 범위

## Database

- Postgres 외 DB 엔진 지원 범위

## Schema/Type

- `bytes` 타입의 JSON 직렬화 표준은 무엇으로 고정할 것인가? (base64 vs hex)
- `decimal` 타입의 precision/scale 파라미터 문법을 어떻게 노출할 것인가?
- Native array 타입 최적화(예: DB native array 직접 매핑) 범위를 v1에 포함할 것인가?
- Cross-DB FK(서로 다른 connection 간 참조) 허용 여부와 제약은 어떻게 정의할 것인가?

## CRUD/Permission

- Nested expand(다단계 FK 확장) 지원 여부와 깊이 제한 정책은 어떻게 정의할 것인가?
- `resource.*` 범용 CEL 조건(테이블/로직 공통) 도입 시점과 호환성 전략은 무엇인가?

## Auth

- End-user 인증 UI(기본 제공 vs 템플릿 제공 vs 완전 비제공)의 제품 범위는 무엇인가?

## Storage/Operations

- Storage credential 관리용 CLI 범위(예: 발급/회전/폐기/권한점검)와 운영 책임 경계는 어디까지인가?
