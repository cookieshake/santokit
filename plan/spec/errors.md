# Errors — Spec

목표:
- Santokit의 에러 포맷과 에러 코드(문자열)의 의미를 표준화한다.
- Bridge(Data Plane)와 Hub(Control Plane)가 일관된 코드를 반환하도록 한다.

---

## 1) Error Response Format

모든 에러는 아래 형식을 따른다.

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "requestId": "..." } }
```

필드:
- `code`: 문자열 에러 코드(대문자 UPPER_SNAKE)
- `message`: 사람에게 보여줄 수 있는 짧은 메시지(민감 정보 포함 금지)
- `requestId`: 요청 추적용 식별자(로그/트레이스와 연결)

규칙:
- `message`에 secret, 토큰, DB URL, SQL 파라미터 값을 포함하지 않는다.
- 필요 시 추가 진단 정보는 서버 로그/트레이스에만 남긴다.

---

## 2) Error Codes (Catalog)

| code | HTTP status | 의미 | 예시 |
|------|------------:|------|------|
| `BAD_REQUEST` | 400 | 입력 파라미터가 스펙을 위반함(타입 불일치, 미지원 연산자, 포맷 오류 등) | 존재하지 않는 컬럼을 `where`에 사용 |
| `UNAUTHORIZED` | 401 | 인증 정보 없음/무효(토큰 만료 포함) | credential이 하나도 없음 |
| `FORBIDDEN` | 403 | 인증은 됐지만 권한이 없음(역할/컬럼 ACL/프로젝트 바인딩 불일치 포함) | API key의 `project/env`와 헤더가 불일치 |
| `NOT_FOUND` | 404 | 리소스/경로가 존재하지 않음 | `path`의 table/logic/bucket이 없음 |
| `CONFLICT` | 409 | 현재 상태와 충돌(중복 생성, 상태 전이 불가 등) | 이미 존재하는 org/team/project 생성 |
| `TOO_MANY_REQUESTS` | 429 | 레이트 리밋에 걸림 | 동일 API key로 초당 제한 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류(예상치 못한 예외, 의존성 실패 포함) | SQL 실행 중 드라이버 에러 |
| `SERVICE_UNAVAILABLE` | 503 | 일시적으로 서비스를 제공할 수 없음(필수 의존성 다운, max-stale 초과 등) | Hub 다운으로 릴리즈 stale 초과 |
| `SCHEMA_VALIDATION_FAILED` | 400 | 이벤트 payload가 토픽 schema를 충족하지 못함 | 필수 필드 누락, 타입 불일치 |

---

## 3) Bridge vs Hub 적용

Bridge(Data Plane):
- 요청/권한/스키마 검증 실패는 `BAD_REQUEST`/`FORBIDDEN`으로 표현한다.
- Hub와 통신 불가/릴리즈 stale 초과는 `SERVICE_UNAVAILABLE`로 표현한다.

Hub(Control Plane):
- 입력 검증 실패는 `BAD_REQUEST`.
- RBAC 거부는 `FORBIDDEN`.
- 존재하지 않는 project/env/releaseId는 `NOT_FOUND`.

---

## 4) 확장 규칙

- 새로운 코드를 추가할 때는 먼저 이 문서에 등록한다.
- 도메인 특화 코드가 필요하면 접두어로 구분한다(예: `SCHEMA_DRIFT`, `RELEASE_BLOCKED`).
  - 단, MVP에서는 위 Catalog 범위 내에서 해결 가능한지 우선 검토한다.
