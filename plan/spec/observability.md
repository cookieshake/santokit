# Observability — Spec (요약)

목표:
- Hub와 Bridge 모두에 대해 메트릭, 트레이싱, 로깅, 감사 로그(Audit Log)의 표준을 정의한다.
- 운영자가 시스템 상태를 파악하고 문제를 진단할 수 있어야 한다.

Encore 참고:
- Encore는 **분산 트레이싱을 기본 내장**한다 — 코드 변경 없이 모든 API 호출, DB 쿼리, Pub/Sub 메시지가 자동으로 트레이스에 포함된다.
- Encore의 로컬 개발 대시보드에서 트레이스를 실시간 조회할 수 있다 — 요청 흐름, SQL 쿼리, 응답 시간을 시각화한다.
- Encore는 Prometheus 메트릭, Grafana 대시보드를 자동 생성하며, 커스텀 메트릭은 `metrics.NewCounter/Gauge` 등으로 선언한다.
- Santokit은 자체 대시보드를 제공하지 않으므로(CLI only), **표준 포맷(OpenTelemetry, Prometheus)으로 외부 도구에 연동**하는 전략이 적합하다.
- Encore의 "코드 변경 없이 자동 계측" 패턴은, Santokit에서도 Bridge의 요청 처리 파이프라인에 자동 계측을 내장하는 것으로 대응할 수 있다.

---

## 1) Health Check

### 1.1 Bridge

| 엔드포인트 | 목적 | 성공 조건 |
|-----------|------|----------|
| `GET /healthz` | Liveness | 프로세스 정상 |
| `GET /readyz` | Readiness | 릴리즈 캐시 로드 완료 + DB connection pool 정상 |

### 1.2 Hub

| 엔드포인트 | 목적 | 성공 조건 |
|-----------|------|----------|
| `GET /healthz` | Liveness | 프로세스 정상 |
| `GET /readyz` | Readiness | 내부 DB 연결 정상 |

### 1.3 응답 규약

공통:
- health/ready 엔드포인트는 기본적으로 auth 없이 접근 가능해야 한다(클러스터/로드밸런서 체크 목적).
- 성공은 `200`, 실패는 `503 SERVICE_UNAVAILABLE`를 사용한다.

`GET /healthz` (Hub/Bridge 공통):
```json
{ "ok": true }
```

`GET /readyz` (Bridge 예시):
```json
{
  "ok": true,
  "releaseCache": { "state": "FRESH" },
  "db": { "ok": true }
}
```

`GET /readyz` 실패(예시):
```json
{
  "ok": false,
  "reason": "release cache not loaded"
}
```

---

## 2) 메트릭

포맷: **Prometheus exposition format** (`GET /metrics`)

### 2.0 메트릭 명명/라벨 규칙(권장)

명명:
- prefix는 `stk_`로 통일한다.
- 단위가 있는 값은 suffix로 명시한다: `_seconds`, `_bytes`, `_total`.
- histogram은 `_bucket/_sum/_count`를 Prometheus 규약대로 노출한다.

라벨(cardinality) 가이드:
- 금지(고카디널): `requestId`, `user_id`, `token_sub`, SQL 문자열, raw URL 전체.
- 허용(저카디널): `project`, `env`, `status`, `connection`, `table`, `op`.
- `path` 라벨은 raw `path` 문자열이 아니라, 템플릿/정규화된 값만 허용한다.
  - 예: `db/users/select`, `logics/admin/users`, `storage/public/upload_sign`

Histogram 버킷(초안):
- request duration: `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`
- db query duration: `0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5`

### 2.1 Bridge 메트릭

| 메트릭 | 타입 | 라벨 | 설명 |
|--------|------|------|------|
| `stk_bridge_requests_total` | Counter | `project`, `env`, `path`, `status` | 요청 수 |
| `stk_bridge_request_duration_seconds` | Histogram | `project`, `env`, `path` | 요청 처리 시간 |
| `stk_bridge_db_query_duration_seconds` | Histogram | `project`, `env`, `connection` | DB 쿼리 시간 |
| `stk_bridge_db_pool_active` | Gauge | `project`, `env`, `connection` | 활성 DB 커넥션 수 |
| `stk_bridge_db_pool_idle` | Gauge | `project`, `env`, `connection` | 유휴 DB 커넥션 수 |
| `stk_bridge_release_cache_age_seconds` | Gauge | `project`, `env` | 캐시된 릴리즈의 나이 |
| `stk_bridge_permission_denials_total` | Counter | `project`, `env`, `table`, `op` | 권한 거부 수 |

### 2.2 Hub 메트릭

| 메트릭 | 타입 | 라벨 | 설명 |
|--------|------|------|------|
| `stk_hub_requests_total` | Counter | `method`, `path`, `status` | API 요청 수 |
| `stk_hub_request_duration_seconds` | Histogram | `method`, `path` | API 처리 시간 |
| `stk_hub_releases_created_total` | Counter | `project`, `env` | 생성된 릴리즈 수 |
| `stk_hub_schema_applies_total` | Counter | `project`, `env`, `result` | 스키마 적용 수 (성공/실패) |

---

## 3) 트레이싱

표준: **OpenTelemetry (OTLP)**

### 3.1 Span 구조 (Bridge `/call` 요청)

```
[bridge.request]                          # root span
  ├── [bridge.auth]                       # 인증 검증 (API key / JWT)
  ├── [bridge.permission]                 # 권한 평가 (CEL 포함)
  ├── [bridge.sql.generate]               # SQL 생성 (Auto CRUD) 또는 Logic 로드
  ├── [bridge.db.execute]                 # DB 쿼리 실행
  │     └── db.statement (attribute)      # 실행된 SQL (sanitized)
  └── [bridge.response]                   # 응답 직렬화
```

### 3.2 Span Attributes (공통)

- `stk.project`, `stk.env`, `stk.releaseId`
- `stk.auth.type` (`api_key` | `bearer` | `cookie` | `none`)
- `stk.table`, `stk.operation` (CRUD의 경우)
- `stk.logic.name` (Custom Logic의 경우)

### 3.3 설정

- `STK_OTEL_ENDPOINT`: OTLP exporter 주소 (예: `http://localhost:4317`)
- `STK_OTEL_ENABLED`: 트레이싱 활성화 여부 (기본: `false`)
- 샘플링: `STK_OTEL_SAMPLE_RATE` (기본: `0.1` = 10%)

### 3.4 데이터 노출 정책(필수)

목표:
- 트레이싱을 통해 민감정보가 유출되지 않도록 한다.

원칙:
- SQL은 문(statement)만 기록하고, 바인딩 파라미터 값은 기록하지 않는다.
  - 허용: `WHERE id = $1`
  - 금지: `WHERE id = 'user_123'`
- 토큰/API key/DB URL/service token은 attribute로 남기지 않는다.
- 사용자 입력(`request.params`)은 기본적으로 attribute로 남기지 않는다.

허용 attribute:
- `db.statement`: sanitize된 SQL 텍스트(placeholder 포함)
- `stk.project`, `stk.env`, `stk.releaseId`
- `http.method`, `http.route`, `http.status_code`

금지 attribute:
- `Authorization` 헤더 원문
- 쿠키 값
- SQL 바인딩 값(PII 가능)

---

## 4) 로깅

포맷: **구조화 JSON 로그**

```json
{
  "ts": "2026-02-10T09:30:00.123Z",
  "level": "info",
  "msg": "request completed",
  "project": "myapp",
  "env": "prod",
  "method": "POST",
  "path": "/call",
  "status": 200,
  "durationMs": 12,
  "requestId": "req_abc123"
}
```

레벨: `error` > `warn` > `info` > `debug` > `trace`
설정: `STK_LOG_LEVEL` (기본: `info`), `STK_LOG_FORMAT` (`json` | `pretty`)

### 4.1 필드 표준(권장)

필수 필드:
- `ts`: RFC3339 timestamp
- `level`: `error|warn|info|debug|trace`
- `msg`: 짧은 메시지
- `requestId`: 요청 식별자(트레이스 correlation에 사용)

Bridge 권장 필드:
- `project`, `env`, `releaseId`
- `method`, `path`, `status`, `durationMs`
- `authType` (`api_key|bearer|cookie|none`)
- `table`, `op` 또는 `logic`

Hub 권장 필드:
- `method`, `path`, `status`, `durationMs`
- `actorId`, `actorType` (audit 연계)

### 4.3 Correlation 규칙(확정)

목적:
- 로그, 트레이스, 감사 로그를 상호 연결해 요청 흐름을 추적하고 디버깅을 지원한다.

ID 체계:
- **`requestId`**: 단일 HTTP 요청의 고유 식별자(ULID 권장).
  - Bridge/Hub 모두 요청 진입 시 생성한다.
  - 응답 헤더에 `X-Request-Id`로 노출한다.
  - 모든 로그 항목에 `requestId` 필드로 포함한다.
- **`traceId`** (OpenTelemetry): 분산 트레이싱의 최상위 trace 식별자.
  - Bridge는 요청마다 `traceId`를 생성 또는 상위 컨텍스트에서 전파한다.
  - `traceId`는 OpenTelemetry span의 표준 필드로 관리된다.
- **Audit log `id`**: 감사 로그 항목의 고유 식별자(BIGINT).

연결 규칙:
1. **로그 ↔ 트레이스**:
   - 로그 항목에 `traceId`, `spanId`를 포함한다(OTEL 활성화 시).
   - 예시: `{"ts": "...", "msg": "...", "requestId": "req_123", "traceId": "abc...", "spanId": "def..."}`
   - 이를 통해 로그 항목을 트레이스 뷰어에서 조회할 수 있다.

2. **로그 ↔ 감사 로그**:
   - Hub가 audit log를 기록할 때 `detail` 필드에 `requestId`를 포함한다.
   - 예시: `{"action": "release.promote", "detail": {"requestId": "req_456", ...}}`
   - 이를 통해 감사 항목에서 해당 요청의 로그/트레이스를 역추적할 수 있다.

3. **트레이스 ↔ 감사 로그**:
   - 감사 로그의 `detail.requestId`를 통해 간접 연결된다.
   - 필요 시 감사 로그에도 `traceId`를 추가할 수 있다(선택).

실무 예시:
- 운영자가 "release.promote 작업이 실패했다"는 감사 로그를 발견한다.
- `detail.requestId`를 추출해 로그 시스템에서 `requestId`로 필터링한다.
- 해당 로그 항목의 `traceId`를 사용해 트레이스 뷰어(Jaeger, Grafana Tempo 등)에서 전체 span 트리를 조회한다.

구현 권장사항:
- Bridge/Hub 모두 로그 컨텍스트에 `requestId`, `traceId`, `spanId`를 자동 포함하도록 구조화 로깅 설정.
- OTEL 비활성화 시에도 `requestId`는 항상 생성/기록한다.

### 4.2 민감정보 마스킹(필수)

금지(로그에 남기지 않음):
- `Authorization` 헤더 원문
- 쿠키 원문
- API key 값, access/refresh token 값, service token 값
- DB URL/비밀번호 등 secret
- SQL 바인딩 값(PII 가능)
- `/internal/keys` 응답의 키 소재(`k` 필드)

허용(필요 시):
- 토큰의 `kid` 같은 비식별 메타데이터
- 에러 분류를 위한 코드/상태/원인(단, 민감 값 제외)

특수 경로 필터링:
- `/internal/keys/*` 경로에 대한 요청/응답은 body를 로그/트레이스에 기록하지 않는다.
- 자세한 규칙: `plan/spec/bridge-hub-protocol.md` Section 1.1.1 참조.

---

## 5) Audit Log

Audit log는 운영 변경 이력을 기록해 컴플라이언스와 디버깅을 지원한다.

- 상세 스펙: `plan/spec/audit-log.md`

---

## 미결정

- Audit log 외부 스트리밍 (S3, SIEM 연동) 지원 시점
- 로컬 개발 시 간이 대시보드 제공 여부 (Encore처럼 로컬 트레이스 뷰어)
