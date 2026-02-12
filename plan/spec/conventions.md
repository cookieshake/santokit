# Conventions

목표:
- 스펙 문서 전반에서 "이름 표기"(snake_case vs camelCase) 규칙을 통일한다.
- API/로그/메트릭/식별자에서 무엇이 "고정 키"이고 무엇이 "사용자 정의 식별자"인지 구분한다.

---

## 1) JSON (HTTP API)

원칙:
- Bridge/Hub가 정의하는 **고정 필드명**은 lowerCamelCase를 사용한다.
  - 예: `requestId`, `releaseId`, `updatedAt`

예외(식별자 보존):
- 테이블명/컬럼명/로직 경로/버킷명 등은 **사용자 정의 식별자**이므로 원본을 그대로 사용한다.
  - 예: 컬럼명이 `created_at`이면 요청/응답에서도 `created_at` 그대로 사용
  - 예: logic path `admin/users`는 `admin/users` 그대로 사용

---

## 2) YAML (Repo Config)

원칙:
- YAML의 고정 키는 lowerCamelCase를 권장한다.
- map의 key로 쓰이는 테이블/컬럼명 등 "식별자"는 원본을 그대로 사용한다.

---

## 3) Logs (구조화 JSON)

원칙:
- 로그 필드명은 JSON API와 동일하게 lowerCamelCase를 사용한다.
  - 예: `requestId`, `durationMs`, `authType`

---

## 4) Metrics (Prometheus)

원칙:
메트릭/로그/트레이스 등 운영 신호가 존재하는 경우에도 이름은 snake_case를 권장한다.

---

## 5) Environment Variables

원칙:
- 환경변수는 관례대로 `UPPER_SNAKE`를 사용한다.
  - 예: `STK_LOG_LEVEL`, `STK_BRIDGE_TOKEN`

---

## 6) Database Schema (Hub internal DB)

원칙:
- Hub의 내부 DB 테이블/컬럼명은 snake_case를 사용한다.
  - 예: `end_user_identities.end_user_id`
