# Glossary

이 문서는 Santokit 스펙 문서에서 반복적으로 등장하는 용어를 정의한다.

---

## 사람/주체

- Operator: Hub(Control Plane)를 운영/관리하는 사람. `stk`(CLI)로 Hub API를 호출한다.
- End User: Bridge(Data Plane)의 `/call`을 호출하는 앱의 최종 사용자.

---

## 구성요소

- Hub (Control Plane): org/team/project/env, secrets, schema plan/apply, permissions, releases, audit log 등을 관리한다.
- Bridge (Data Plane): `POST /call` 런타임. 릴리즈를 pull/캐시해 Auto CRUD/Logic/Storage 요청을 처리한다.
- `stk` (CLI): Operator가 Hub를 조작하는 단일 진입점(웹 콘솔 대체).

---

## 멀티테넌시 단위

- org: 최상위 조직 단위.
- team: org 내 협업 단위.
- project: 하나의 Santokit 앱 단위(스키마/권한/릴리즈가 귀속).
- env: project 내부의 환경 단위(dev/stg/prod 등). env마다 current release 포인터를 가진다.

---

## DB/스키마

- connection: Hub에 등록된 DB 연결 설정의 이름. 테이블은 `connection`에 속한다.
- 선언 스키마: `schema/*.yaml`에 있는 YAML 스키마. Source of Truth.
- schema_ir: 선언 스키마를 파싱/검증해 얻는 엔진 중립 내부 IR.
- ddl_plan: `schema_ir`를 특정 엔진(Postgres 등)에 대해 적용하기 위한 계획.
- schema_snapshot: 실제 DB 인트로스펙션 결과. 검증/드리프트 감지에 사용.
- drift(드리프트): 선언 스키마/스냅샷과 실제 DB 상태가 불일치하는 상태.

---

## 릴리즈

- releaseId: 스키마 IR + 권한 + 설정의 불변 스냅샷 식별자.
- current release pointer: env가 가리키는 현재 적용 대상 releaseId.
- release payload: Bridge가 실행에 필요한 릴리즈 전체 페이로드(permissions, schema_ir, 기타 config).

---

## 인증/자격증명

- Project API Key: 서버/CI 등 신뢰된 호출자가 Bridge에 요청할 때 사용하는 키.
- access token: End User가 Bridge에 요청할 때 사용하는 토큰.
- refresh token: (선택) access token 갱신을 위한 토큰.
- service token: Bridge가 Hub `/internal/*` API를 호출하기 위해 사용하는 서비스 자격증명.

---

## 런타임 호출

- `/call`: Bridge의 단일 런타임 엔드포인트. `path`로 기능을 선택한다.
- Auto CRUD: `db/{table}/{op}` 형태의 기본 CRUD.
- Custom Logic: `logics/{name}` 형태의 SQL 기반 로직.
- Storage: `storage/{bucket}/{op}` 형태의 presigned URL 기반 파일 작업.

---

## 운영/관측

- audit log: Hub에서 운영 변경 이력을 남기는 로그.
- metrics: Prometheus 형식으로 노출되는 메트릭.
- tracing: OpenTelemetry 기반 분산 트레이싱.

---

## 도구 통합

- MCP (Model Context Protocol): AI 도구와 통합하기 위한 프로토콜.
- MCP server: `stk mcp`가 제공하는 MCP 서버(프로젝트 스키마/권한/릴리즈/조회 도구 제공).
