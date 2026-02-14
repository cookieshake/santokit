# CRUD Spec (Shared Rules)

이 문서는 Auto CRUD의 공통 규칙만 정의한다.
기능 단위 규범은 `plan/capabilities/crud/*.md`를 SoT로 사용한다.

## Shared Rules

- Bridge 엔드포인트는 `POST /call`.
- CRUD path는 `db/{table}/{op}`이며 `op`는 `select|insert|update|delete`.
- SQL은 선언 스키마/권한 기반으로 생성하며 사용자 입력 SQL은 허용하지 않는다.
- where 미지원 연산자/타입은 `400`.
- 기본 안전장치: `where` 없는 `update/delete`는 차단.
- expand는 선언된 relation에 한해 허용하며 invalid relation은 `400`.

## Capability Mapping

- `CRUD-001`: 기본 insert/select 및 생성 ID 응답
- `CRUD-002`: advanced update/delete
- `CRUD-003`: FK expand
- `CRUD-004`: pagination/sorting
- `CRUD-005`: array item type validation
