# Bridge ↔ Hub 통신 프로토콜 — Spec (요약)

목표:
- Bridge(Data Plane)와 Hub(Control Plane) 간 통신의 transport, 인증, 동기화, 장애 대응을 정의한다.
- 현재 `final.md`에 "pull/캐시 후 실행"으로만 기술된 부분을 구체화한다.

Encore 참고:
- Encore는 서비스 간 통신에 gRPC 기반 service discovery를 사용하며, 정적 분석으로 의존 그래프를 빌드 타임에 확정한다.
- Encore의 "Process Allocation Strategy"는 논리적 서비스 경계와 배포 토폴로지를 분리한다 — 같은 코드가 단일 프로세스 또는 서비스별 프로세스로 배포 가능하며, 이는 환경별 대시보드 설정만으로 전환된다.
- Santokit은 Hub/Bridge가 명확히 분리된 2-tier 구조이므로, Encore의 "유연한 배포 토폴로지"보다는 **안정적이고 예측 가능한 통신 프로토콜**에 집중해야 한다.
- Encore의 Infrastructure Namespaces(`encore ns switch --create pr:123`) 개념은, Bridge가 특정 릴리즈/환경 컨텍스트를 격리하는 방식에 참고할 수 있다.

---

## 1) Transport

방식: **HTTP(REST) polling** (MVP)

근거:
- Hub는 이미 Axum 기반 HTTP 서버이므로 추가 프로토콜 도입 비용이 없다.
- Bridge → Hub 방향만 존재한다(Hub이 Bridge에 push할 필요 없음).
- 향후 WebSocket push 또는 gRPC streaming으로 전환 가능하되, MVP에서는 단순성 우선.

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

성공(200) 응답 예시:
```json
{
  "project": "myapp",
  "env": "prod",
  "keys": [
    { "kid": "k1", "status": "current", "createdAt": "2026-01-01T00:00:00Z" },
    { "kid": "k0", "status": "previous", "createdAt": "2025-12-01T00:00:00Z" }
  ]
}
```

규칙:
- 실제 키 소재(비밀값)는 이 API에서 전달하지 않는다.
- Bridge가 검증에 필요한 형태(JWK, raw key bytes 등)는 별도 섹션에서 확정한다.

prefix:
- `/internal/` prefix는 외부 노출을 차단하며, 네트워크 정책 또는 reverse proxy로 격리한다.

---

## 2) 인증 (Bridge → Hub)

방식: **Service Token** (shared secret)

- Bridge 시작 시 환경변수 `STK_BRIDGE_TOKEN`으로 주입한다.
- 모든 `/internal/*` 요청에 `Authorization: Bearer <service_token>` 헤더를 포함한다.
- Hub는 토큰 검증 후 Bridge 요청을 수락한다.
- (향후) mTLS로 전환 가능. MVP에서는 토큰 기반.

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

Hub 설정:
- `STK_BRIDGE_TOKENS`: 허용 토큰 목록(쉼표 구분). 최소 1개.

Bridge 설정:
- `STK_BRIDGE_TOKEN`: Bridge가 사용할 토큰(단일).

검증:
- Hub는 `Authorization: Bearer <token>`에서 `<token>`을 추출해 `STK_BRIDGE_TOKENS`에 포함되는지 확인한다.

무중단 회전(권장):
1. 새 토큰 발급
2. Hub에 새 토큰을 추가(기존 토큰 유지): `STK_BRIDGE_TOKENS=old,new`
3. Bridge를 새 토큰으로 재배포: `STK_BRIDGE_TOKEN=new`
4. 모든 Bridge가 전환된 것이 확인되면 Hub에서 구 토큰 제거: `STK_BRIDGE_TOKENS=new`

유출 대응(최소):
- Hub에서 유출된 토큰을 즉시 제거하고, 신규 토큰을 발급/배포한다.
- 필요 시 네트워크 정책으로 `/internal/*` 접근을 추가 제한한다.

---

## 3) 릴리즈 동기화

### 3.1 Polling 주기

- 기본 TTL: **30초** (설정 가능: `STK_BRIDGE_POLL_INTERVAL`)
- Bridge는 TTL마다 `GET /internal/releases/current`를 호출한다.
- 응답의 `releaseId`가 로컬 캐시와 다르면 전체 페이로드를 pull한다.
- ETag/If-None-Match를 사용해 변경 없으면 `304 Not Modified`로 트래픽 절감.

### 3.2 캐시 전략

- Bridge는 메모리에 "현재 릴리즈 페이로드"를 캐시한다.
- 캐시는 project+env 단위로 관리한다 (멀티 프로젝트 지원).
- 캐시 미스 시 (최초 기동 또는 새 project+env 요청) 즉시 Hub에 pull한다.

### 3.3 Bootstrap 시퀀스

Bridge 시작 시:
1. Hub health check (`GET /internal/healthz`) — 실패 시 재시도 (backoff)
2. 자신이 서빙할 project+env 목록 확인 (환경변수 또는 Hub에서 조회)
3. 각 project+env의 현재 릴리즈 pull
4. signing keys pull
5. readiness 전환 (`/readyz` → `200`)

### 3.4 Signing Key 동기화

- Bridge는 End User 토큰 검증을 위해 signing keys를 Hub에서 pull한다.
- key rotation 지원: 현재 key + 이전 key를 동시 보유.
- polling 주기: 릴리즈 polling과 동일.

### 3.5 캐시 상태 전이(권장)

Bridge는 project+env 단위로 아래 상태를 가진다.

| 상태 | 정의 | `/call` 처리 | `/readyz` |
|------|------|--------------|-----------|
| `EMPTY` | 한 번도 릴리즈를 가져오지 못함 | 거부(`503 SERVICE_UNAVAILABLE`) | 실패 |
| `FRESH` | 마지막 성공 fetch 시각이 `poll_interval` 이내 | 정상 처리 | 성공 |
| `STALE` | 마지막 성공 fetch가 실패했지만 `max_stale` 이내 | 캐시된 릴리즈로 계속 처리(경고 로그) | 성공 |
| `EXPIRED` | 마지막 성공 fetch가 `max_stale` 초과 | 거부(`503 SERVICE_UNAVAILABLE`) | 실패 |

변수:
- `poll_interval`: `STK_BRIDGE_POLL_INTERVAL` (예: 30s)
- `max_stale`: `STK_BRIDGE_MAX_STALE` (예: 1h)

전이 규칙(요약):
- 성공적으로 release payload를 로드하면 `FRESH`로 전이한다.
- polling 실패 시 `FRESH -> STALE`.
- STALE 상태에서 `now - last_success > max_stale`면 `EXPIRED`.
- `EXPIRED`에서 fetch가 성공하면 `FRESH`로 복귀한다.

콜드 스타트 규칙:
- Bridge 프로세스 기동 직후에는 모든 project+env가 `EMPTY`다.
- 운영자가 지정한 "필수 project+env"에 대해 초기 load가 완료되기 전까지 readiness는 성공하지 않는다.
- (선택) 멀티테넌트 환경에서 "on-demand load"를 허용하면, 특정 project+env는 최초 요청 시 load를 시도한다.

---

## 4) 장애 모드

| 상황 | Bridge 동작 |
|------|-------------|
| Hub 일시 다운 (polling 실패) | 캐시된 릴리즈로 계속 서빙. 로그 경고. |
| Hub 장기 다운 (> `STK_BRIDGE_MAX_STALE`, 기본 1시간) | 새 요청 거부 (`503`). 기존 in-flight 요청은 완료. |
| Hub 복구 | 다음 polling에서 자동 복구. |
| Bridge 시작 시 Hub 미도달 | readiness 실패. 트래픽 수신 안 함. 재시도 지속. |
| 릴리즈 페이로드 손상 | 이전 유효 캐시 유지. 에러 로그. Hub에 보고(best-effort). |

### 4.1 재시도/타임아웃 표준(권장)

Hub 요청 타임아웃:
- `STK_BRIDGE_HUB_TIMEOUT` (default: `3s`)

재시도(backoff):
- polling tick에서 Hub 요청이 실패하면 즉시 무한 재시도를 하지 않는다.
- 다음 tick까지 기다리되, bootstrap 단계에서는 아래 backoff로 재시도한다.

bootstrap backoff:
- `STK_BRIDGE_HUB_BACKOFF_MIN` (default: `1s`)
- `STK_BRIDGE_HUB_BACKOFF_MAX` (default: `30s`)
- 정책: exponential backoff + jitter
  - `delay = min(max, min * 2^attempt)`, `delay *= random(0.8..1.2)`

로깅:
- backoff 재시도는 `warn`로, `EXPIRED` 전이는 `error`로 기록한다.
- 모든 로그에는 `project`, `env`, `hubUrl`(가능하면)과 `requestId`를 포함한다.

메트릭(추가 권장):
- `hub_poll_failures_total{project,env}`
- `release_cache_state{project,env}` (0=EMPTY,1=FRESH,2=STALE,3=EXPIRED)

---

## 5) 향후 확장

- **Push 방식**: Hub가 릴리즈 변경 시 Bridge에 WebSocket/SSE로 알림 → polling 주기 대폭 축소.
- **gRPC streaming**: 대규모 배포 시 효율적 바이너리 전송.
- **mTLS**: 서비스 토큰 대신 인증서 기반 상호 인증.
- **Hub HA**: MVP에서는 Bridge가 "여러 hubUrl"을 발견/페일오버하지 않는다. HA는 단일 `hubUrl` 뒤의 L7/L4 LB로 해결한다.

---

## 미결정

- Push 방식 도입 시점 및 우선순위
- 멀티 Bridge 인스턴스 간 캐시 일관성 보장 필요 여부
