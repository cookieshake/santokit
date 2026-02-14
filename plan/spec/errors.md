# Errors — Spec

## 1) Error Response Format

모든 에러 응답은 아래 형식을 따른다.

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "requestId": "..." } }
```

필드:
- `code`: 문자열 에러 코드 (대문자 UPPER_SNAKE)
- `message`: 사람에게 보여줄 수 있는 짧은 메시지
- `requestId`: 요청 추적용 식별자 (로그/트레이스와 연결)

메시지 안전 규칙:
- `message`에 secret, 토큰, DB URL, SQL 파라미터 값을 포함하지 않는다.
- 추가 진단 정보는 서버 로그/트레이스에만 남긴다.

---

## 2) Error Code Catalog

| Code | HTTP | 의미 |
|------|-----:|------|
| `BAD_REQUEST` | 400 | 입력 파라미터가 스펙을 위반함 (타입 불일치, 미지원 연산자, 포맷 오류 등) |
| `SCHEMA_VALIDATION_FAILED` | 400 | 입력 payload가 선언된 스키마/타입 규칙을 충족하지 못함 (필수 필드 누락, 타입 불일치) |
| `UNAUTHORIZED` | 401 | 인증 정보 없음/무효 (토큰 만료 포함) |
| `FORBIDDEN` | 403 | 인증은 됐지만 권한이 없음 (역할/컬럼 ACL/프로젝트 바인딩 불일치 포함) |
| `NOT_FOUND` | 404 | 리소스/경로가 존재하지 않음 |
| `CONFLICT` | 409 | 현재 상태와 충돌 (중복 생성, 상태 전이 불가 등) |
| `TOO_MANY_REQUESTS` | 429 | 레이트 리밋에 걸림 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 (예상치 못한 예외, 의존성 실패 포함) |
| `SERVICE_UNAVAILABLE` | 503 | 일시적으로 서비스를 제공할 수 없음 (필수 의존성 다운, max-stale 초과 등) |

---

## 3) Bridge vs Hub 책임

Bridge (Data Plane):
- 요청/권한/스키마 검증 실패: `BAD_REQUEST` / `FORBIDDEN`
- Hub 통신 불가 또는 릴리즈 stale 초과: `SERVICE_UNAVAILABLE`

Hub (Control Plane):
- 입력 검증 실패: `BAD_REQUEST`
- RBAC 거부: `FORBIDDEN`
- 존재하지 않는 project/env/releaseId: `NOT_FOUND`

---

## 4) 확장 규칙

- 새로운 코드를 추가할 때는 먼저 이 문서에 등록한다.
- 도메인 특화 코드가 필요하면 접두어로 구분한다 (예: `SCHEMA_DRIFT`, `RELEASE_BLOCKED`).
- MVP에서는 위 Catalog 범위 내에서 해결 가능한지 우선 검토한다.
