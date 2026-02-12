# Bridge ↔ Hub 통신 프로토콜 — Spec (요약)

목표:
- Bridge(Data Plane)와 Hub(Control Plane) 간 통신의 transport, 인증, 동기화, 장애 대응을 정의한다.
- 현재 `final.md`에 "pull/캐시 후 실행"으로만 기술된 부분을 구체화한다.

---

## 1) Transport

방식: **HTTP(REST) polling** (MVP)

근거:
- Hub는 이미 Axum 기반 HTTP 서버이므로 추가 프로토콜 도입 비용이 없다.
- Bridge → Hub 방향만 존재한다(Hub이 Bridge에 push할 필요 없음).

엔드포인트 (Hub 측):
- `GET /internal/releases/current?project={p}&env={e}` — 현재 릴리즈 메타데이터
- `GET /internal/releases/{releaseId}` — 릴리즈 전체 페이로드 (schema IR + permissions + config)
- `GET /internal/keys/{project}/{env}` — End User 토큰 검증용 signing keys
- `GET /internal/healthz` — Hub health check

### 1.1 Internal API 계약 (초안)

공통:
- Request header: `Authorization: Bearer <service_token>`
- Response header: `X-Request-Id: <id>`
- 4xx/5xx 에러 포맷: `plan/spec/errors.md`

#### `GET /internal/healthz`

응답:
```json
{ "ok": true }
```

#### `GET /internal/releases/current?project={p}&env={e}`

목적:
- Bridge가 "현재 포인터가 가리키는 releaseId"를 경량으로 확인한다.

캐싱:
- Response header로 `ETag`를 포함한다.
- Bridge는 다음 polling부터 `If-None-Match: <etag>`를 보낼 수 있다.
- 변경이 없으면 `304 Not Modified`를 반환한다.

성공(200) 응답 예시:
```json
{
  "project": "myapp",
  "env": "prod",
  "releaseId": "rel_01H...",
  "updatedAt": "2026-02-10T09:30:00Z"
}
```

실패:
- project/env가 없으면 `404 NOT_FOUND`

#### `GET /internal/releases/{releaseId}`

목적:
- Bridge가 실행에 필요한 릴리즈 페이로드를 받는다.

성공(200) 응답 예시(상위 구조만 고정):
```json
{
  "releaseId": "rel_01H...",
  "project": "myapp",
  "env": "prod",
  "schema": {
    "irByConnection": {
      "main": { "version": 1, "tables": { } }
    }
  },
  "permissions": { "version": 1, "tables": { } },
  "config": { }
}
```

규칙:
- `schema.irByConnection`은 `plan/spec/schema.md`의 `schema_ir` 산출물에 해당한다.
- `permissions`의 구조는 `config/permissions.yaml`를 기반으로 하며(`plan/spec/crud.md`), 릴리즈에 포함되는 "컴파일된 표현"을 사용한다.

실패:
- 존재하지 않는 releaseId면 `404 NOT_FOUND`

#### `GET /internal/keys/{project}/{env}`

목적:
- Bridge가 End User access token 검증에 필요한 키를 동기화한다.

규칙:
- 이 API는 Bridge가 End User access token 검증에 필요한 **키 소재**를 전달한다.
- 이 엔드포인트는 `/internal/*` 네트워크 격리 + service token 인증을 전제로 한다.
- **민감정보 보호**: 응답 내용은 로깅/트레이싱 대상에서 제외해야 한다(아래 Section 1.1.1 참조).

키 포맷(결정, MVP):
- Santokit End User access token이 PASETO v4.local(대칭키)인 경우:
  - Hub는 key bytes를 base64(RFC4648, no wrap)로 전달한다.
  - Bridge는 메모리에만 보관하고 디스크에 저장하지 않는다.
  - rotation을 위해 `current` + `previous`를 동시 제공한다.

성공(200) 응답 예시(확정 구조):
```json
{
  "project": "myapp",
  "env": "prod",
  "keys": [
    {
      "kid": "k1",
      "status": "current",
      "createdAt": "2026-01-01T00:00:00Z",
      "k": "base64_key_bytes"
    },
    {
      "kid": "k0",
      "status": "previous",
      "createdAt": "2025-12-01T00:00:00Z",
      "k": "base64_key_bytes"
    }
  ]
}
```

#### 1.1.1 민감정보 필터링 규칙(확정)

목표:
- `/internal/keys` 응답에 포함된 키 소재가 로그/트레이스에 유출되지 않도록 한다.

필터링 계층:
1. **HTTP 미들웨어 레벨** (Hub/Bridge 공통):
   - `/internal/keys/*` 경로에 대한 요청/응답은 구조화 로그의 `request.body`, `response.body` 필드에 기록하지 않는다.
   - 로그에는 메타데이터만 포함: `{"path": "/internal/keys/myapp/prod", "status": 200, "durationMs": 12}`

2. **OpenTelemetry Span Attributes**:
   - `/internal/keys/*` 요청의 span에는 `http.request.body`, `http.response.body` attribute를 포함하지 않는다.
   - span name은 `GET /internal/keys/{project}/{env}`로 남기되, project/env 값은 포함 가능(키 소재는 제외).

3. **에러 로그**:
   - `/internal/keys` 처리 중 에러 발생 시, 에러 메시지에 키 값을 포함하지 않는다.
   - 예: `"Failed to fetch keys for project=myapp, env=prod"` (O)
   - 예: `"Failed to decrypt key: k=abc123..."` (X)

허용 목록(로그/트레이스에 남겨도 되는 정보):
- `kid` (key ID) — 키 식별자, 민감하지 않음
- `status` (`current`, `previous`)
- `createdAt`
- `project`, `env`

금지 목록(절대 로그/트레이스에 남기지 않음):
- `k` (key bytes의 base64 인코딩)
- service token 값
- 모든 암호화 키/토큰의 원문

prefix:
- `/internal/` prefix는 외부 노출을 차단하며, 네트워크 정책 또는 reverse proxy로 격리한다.

---

## 2) 인증 (Bridge → Hub)

방식: **Service Token** (shared secret)

- Bridge는 시작 시 service token을 환경설정으로 주입받는다.
- 모든 `/internal/*` 요청에 `Authorization: Bearer <service_token>` 헤더를 포함한다.
- Hub는 토큰 검증 후 Bridge 요청을 수락한다.

### 2.1 위협 모델(요약)

목표:
- 외부에서 `/internal/*`에 접근하거나, Bridge를 사칭해 Hub 데이터를 읽는 것을 방지한다.

가정:
- `/internal/*`은 네트워크 레벨에서 외부 공개를 금지한다(방화벽/보안그룹/리버스 프록시).
- Service token은 "네트워크 격리 + 애플리케이션 레벨 인증"의 2중 방어 중 2번째 레이어다.

금지:
- token을 로그에 출력하지 않는다.
- token을 Git/이미지/manifest에 포함하지 않는다.

### 2.2 토큰 검증/회전(운영 절차)

최소 규칙:
- Hub는 허용된 service token 목록(allowlist)을 가진다.
- Bridge는 단일 service token으로 Hub의 `/internal/*`을 호출한다.
- 회전은 overlap 방식으로 수행한다(새 토큰을 추가한 뒤 Bridge를 전환하고, 구 토큰을 제거).
- 유출 시 Hub에서 즉시 토큰을 제거하고, 신규 토큰으로 교체한다.

---

## 3) 릴리즈 동기화

원칙:
- Bridge는 project+env 단위로 Hub의 current release를 polling하고, 필요한 페이로드만 pull/캐시한다.
- 캐시는 메모리에만 유지한다.

동작:
1. 주기적으로 `GET /internal/releases/current?project={p}&env={e}` 호출 (ETag 지원)
2. `releaseId`가 바뀌면 `GET /internal/releases/{releaseId}`로 전체 페이로드를 pull
3. End User 토큰 검증을 위해 `GET /internal/keys/{project}/{env}`도 주기적으로 pull

장애 시 정책(최소):
- Hub 일시 장애 시: 마지막으로 성공적으로 받은 캐시로 계속 처리한다.
- Hub 장기 장애 시: 캐시가 너무 오래되면 새 요청은 `503 SERVICE_UNAVAILABLE`로 거부한다.
- 콜드 스타트(최초 기동)에서 필수 project+env의 초기 로드 전에는 readiness가 성공하지 않는다.

---

## 4) 장애 모드

최소 동작:
- Hub polling 실패: 캐시가 있으면 서빙을 유지하고 경고 로그를 남긴다.
- Hub 장기 장애: 캐시가 너무 오래되면 새 요청을 `503`으로 거부한다.
- 릴리즈 페이로드 손상: 이전 유효 캐시를 유지한다.

로깅(필수):
- 모든 로그에는 `project`, `env`와 `requestId`를 포함한다.

---

향후 확장/미결정 항목은 `plan/notes/open-questions.md`에서 관리한다.
