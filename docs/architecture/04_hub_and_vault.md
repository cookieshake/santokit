# 04. Hub & Vault 명세 (Spec)

## 존재 의의
Hub는 프로젝트 상태와 배포의 **진실의 원천**이다. CLI/Server/Client가 모두 Hub를 기준으로 동작한다.

## 핵심 행동
- 매니페스트 저장/버전 관리
- 프로젝트 설정 저장
- Vault 비밀 정보 암호화 저장
- 스키마 plan/apply 수행
- 최신 번들 Edge KV 배포

## 상태 표기
- ✅ 구현됨
- 🟡 부분 구현
- ❌ 미구현

## Hub API (Spec + Status)
기본 베이스: `https://<hub>/api/v1`
모든 project-scoped API는 `X-Santokit-Project-ID` 헤더를 필수로 사용한다.

### Auth (SDK 호환)
- **존재 의의**: SDK/CLI 로그인, 토큰 발급
- **동작**: JWT 생성 및 검증

- `POST /auth/login`
  - 입력: `{ email, password }`
  - 출력: `{ user, accessToken, expiresAt }`
  - 상태: ✅ (비밀번호 검증 없음)

- `POST /auth/register`
  - 입력: `{ email, password, name?, metadata? }`
  - 출력: `{ user, accessToken, expiresAt }`
  - 상태: ✅ (저장 없음)

- `POST /auth/refresh`
  - 입력: `Authorization: Bearer <token>`
  - 출력: `{ user, accessToken, expiresAt }`
  - 상태: ✅

- `POST /auth/logout`
  - 출력: `{ status: "ok" }`
  - 상태: ✅ (무효화 없음)

- `GET /auth/me`
  - 출력: `{ id, email, roles }`
  - 상태: ✅

- `GET /auth/oauth`
  - 상태: ❌ (미구현)

### Manifest
- **존재 의의**: 로직/스키마의 버전된 상태 저장
- **동작**: 업로드 시 최신 번들을 `project:{id}:latest`로 프로비저닝

- `GET /api/v1/manifest`
  - 헤더: `X-Santokit-Project-ID`
  - 최신 매니페스트 반환
  - 상태: ✅

- `POST /api/v1/manifest`
  - 헤더: `X-Santokit-Project-ID`
  - 입력: `{ bundles[] }`
  - 동작: 매니페스트 저장 + 최신 번들 생성
  - 상태: ✅

### Secrets
- **존재 의의**: 평문 비밀정보 저장 유일 지점
- **동작**: AES-256-GCM 암호화

- `GET /api/v1/secrets`
  - 헤더: `X-Santokit-Project-ID`
  - 키 목록 반환
  - 상태: ✅

- `POST /api/v1/secrets`
  - 헤더: `X-Santokit-Project-ID`
  - 입력: `{ key, value }`
  - 상태: ✅

- `DELETE /api/v1/secrets/{key}`
  - 헤더: `X-Santokit-Project-ID`
  - 상태: ✅

### Schema
- **존재 의의**: DB 스키마의 안전한 변경
- **동작**: Atlas 기반 diff/plan/apply

- `POST /api/v1/schema/plan`
  - 헤더: `X-Santokit-Project-ID`
  - 입력: `{ schemas }`
  - 상태: ✅

- `POST /api/v1/schema/apply`
  - 헤더: `X-Santokit-Project-ID`
  - 입력: `{ migrations[] }`
  - 상태: ✅

### Config
- **존재 의의**: 프로젝트 설정을 중앙에서 관리
- **동작**: DB 연결, auth, storage 설정 저장

- `POST /api/v1/config/apply`
  - 헤더: `X-Santokit-Project-ID`
  - 입력: `{ configs }`
  - 상태: ✅

- `GET /api/v1/config`
  - 헤더: `X-Santokit-Project-ID`
  - 상태: ✅

### Projects
- **존재 의의**: 프로젝트/팀 메타데이터 관리
- **동작**: 프로젝트 생성 및 조회

- `GET /api/v1/projects`
  - 상태: ✅

- `POST /api/v1/projects`
  - 상태: ✅

- `GET /api/v1/projects/{id}`
  - 상태: ✅
