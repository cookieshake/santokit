# Pub/Sub + Cron 선언 — Spec (요약)

목표:
- Auto CRUD와 Custom Logic만으로는 해결하기 어려운 **비동기 이벤트 처리**와 **정기 작업**을 선언적으로 지원한다.
- 기존 YAML 기반 선언 패턴을 확장해, 새로운 런타임/언어 도입 없이 이벤트/Cron을 정의한다.

Encore 참고 (Pub/Sub):
- Encore는 Pub/Sub을 **코드 레벨 선언**으로 정의한다:
  - `pubsub.NewTopic[*EventType]("name", config)` — 타입 안전한 토픽 선언
  - `pubsub.NewSubscription(topic, "name", config)` — 구독 + 핸들러 등록
- 전달 보장: `AtLeastOnce` (기본) 또는 `ExactlyOnce`
- 순서 보장: `OrderingAttribute`로 특정 필드 기준 순서 보장 가능
- 리트라이 정책: `MinBackoff`, `MaxBackoff`, `MaxRetries` 설정
- Dead Letter Queue(DLQ) 지원
- 테스트 격리: 테스트별 독립 동작, `et.Topic(t).PublishedMessages()`로 발행 검증
- **Outbox 패턴**: `x.encore.dev/pubsub/outbox`로 DB 트랜잭션과 메시지 발행의 원자성 보장
- Typed Reference: `pubsub.TopicRef[pubsub.Publisher[*Event]](topic)`로 DI/라이브러리에서 권한 사전 선언

Encore 참고 (Cron):
- `cron.NewJob("id", config)` — 주기적(`Every`) 또는 cron 표현식(`Schedule`) 지원
- 실행 대상: 파라미터 없는 API 엔드포인트 (`func(ctx) error`)
- 컴파일 타임 검증: `Every` 값이 24시간을 균등 분할하지 않으면 컴파일 에러
- 로컬 개발/프리뷰 환경에서는 실행하지 않음
- 플랫폼이 스케줄링 전체를 관리 (외부 스케줄러 불필요)

Santokit 적용 방향:
- Encore는 Go/TS 코드에서 선언하지만, Santokit은 YAML 파일로 선언한다.
- Encore의 "Infrastructure as Code-Level Declarations" 패턴을 YAML로 번역한다.
- 이벤트 핸들러는 Custom Logic(SQL)과 연동해, 별도 런타임 없이 처리한다.

---

## 1) Pub/Sub

### 1.1 파일 구조

- 토픽 정의: `events/topics/*.yaml`
- 구독 정의: `events/subscriptions/*.yaml`
- (선택) 트리거 정의: `events/triggers/*.yaml`

### 1.1.1 YAML 스키마(초안)

Topic (`events/topics/*.yaml`):

| 필드 | 필수 | 타입 | 설명 |
|------|:---:|------|------|
| `name` | O | string | 토픽 이름(전역 유니크) |
| `description` | X | string | 설명 |
| `schema` | O | object | 이벤트 페이로드 스키마 |
| `delivery` | X | enum | `at_least_once`(default) 
| `retention` | X | duration | 예: `7d`, `24h` |

Subscription (`events/subscriptions/*.yaml`):

| 필드 | 필수 | 타입 | 설명 |
|------|:---:|------|------|
| `topic` | O | string | 구독할 토픽 이름 |
| `name` | O | string | 구독 이름(토픽 내 유니크) |
| `handler` | O | string | `logics/<path>` 형태의 핸들러 |
| `retry.maxRetries` | X | int | default: 3 |
| `retry.minBackoff` | X | duration | default: 1s |
| `retry.maxBackoff` | X | duration | default: 60s |
| `deadLetter` | X | boolean | default: false |

검증 규칙(최소):
- 구독의 `topic`은 존재하는 토픽을 참조해야 한다.
- 구독의 `handler`는 존재하는 Custom Logic을 참조해야 한다.
- duration은 `1s`, `500ms`, `6h`, `7d` 같은 단위를 허용한다.

### 1.2 토픽 선언

```yaml
# events/topics/order_placed.yaml
name: order_placed
description: "주문이 생성되었을 때 발행"
schema:
  orderId: { type: string, required: true }
  userId: { type: string, required: true }
  amount: { type: decimal, required: true }
  items: { type: json }
delivery: at_least_once    # at_least_once | exactly_once
retention: 7d              # 메시지 보존 기간
```

### 1.3 구독 선언

```yaml
# events/subscriptions/send_order_email.yaml
topic: order_placed
name: send_order_email
handler: logics/on_order_placed   # Custom Logic 연동
retry:
  maxRetries: 3
  minBackoff: 1s
  maxBackoff: 60s
deadLetter: true                  # 실패 메시지를 DLQ로 이동
```

- `handler`는 Custom Logic(`logics/*.sql`)을 가리킨다.
- 핸들러 SQL은 이벤트 페이로드를 `:event.orderId`, `:event.userId` 등으로 참조한다.

### 1.3.1 실행 semantics (MVP)

전달 보장:
- MVP는 `at_least_once`를 기본으로 한다.
- 동일 이벤트가 중복 전달될 수 있으므로, handler는 **멱등(idempotent)** 해야 한다.

메시지 메타데이터(권장):
- 모든 handler에는 payload 외에 아래 메타를 함께 제공한다.
  - `event.id`: ULID
  - `event.topic`: topic name
  - `event.publishedAt`: RFC3339
  - `event.attempt`: 1부터 시작

리트라이:
- handler 실패 시 `retry` 정책에 따라 재시도한다.
- backoff는 `minBackoff..maxBackoff` 범위의 exponential backoff를 사용한다.

DLQ:
- `deadLetter=true`인 구독은 최대 재시도 초과 시 DLQ로 이동한다.
- DLQ는 최소한 "실패 이벤트 + 마지막 에러"를 조회할 수 있어야 한다.

멱등 가이드(예):
- handler가 DB에 side-effect를 만든다면 `event.id`를 유니크 키로 저장해 중복 처리 방지

### 1.4 이벤트 발행

Auto CRUD 연동 (선언적, 권장: 트리거 파일):
```yaml
# events/triggers/orders_insert_order_placed.yaml
on: insert
table: orders
topic: order_placed
mapping:
  orderId: id
  userId: user_id
  amount: total_amount
```

Trigger (`events/triggers/*.yaml`) YAML 스키마(초안):

| 필드 | 필수 | 타입 | 설명 |
|------|:---:|------|------|
| `on` | O | enum | `insert|update|delete` |
| `table` | O | string | 대상 테이블 |
| `topic` | O | string | 발행할 토픽 |
| `mapping` | O | object | topic schema field → table column |

검증 규칙(최소):
- `table`은 선언 스키마에 존재해야 한다.
- `topic`은 정의된 토픽이어야 한다.
- `mapping`은 토픽 schema의 required field를 충족해야 한다.

Custom Logic 내 발행:
```sql
---
description: "주문 생성 로직"
auth: authenticated
params:
  itemId: { type: string, required: true }
publish:
  - topic: order_placed
    mapping: { orderId: ":result.id", userId: ":auth.sub", amount: ":result.total" }
---
INSERT INTO orders (user_id, item_id, total_amount) ...
```

### 1.5 발행 권한

```yaml
# config/permissions.yaml 확장
events:
  order_placed:
    publish:
      - roles: [admin, service]
        allow: true
```

---

## 2) Cron Jobs

### 2.1 파일 구조

- 정의: `cron/*.yaml`

### 2.1.1 YAML 스키마(초안)

Cron (`cron/*.yaml`):

| 필드 | 필수 | 타입 | 설명 |
|------|:---:|------|------|
| `name` | O | string | job 이름(전역 유니크) |
| `description` | X | string | 설명 |
| `schedule` | 조건 | string | cron 표현식(5-field) |
| `every` | 조건 | duration | 주기(예: `6h`) |
| `handler` | O | string | `logics/<path>` |
| `connection` | X | string | default: `main` |
| `timeout` | X | duration | default: `30s` |
| `enabled` | X | boolean | default: true |

환경별 활성/비활성:
- 릴리즈는 env 단위이므로, 동일 repo라도 env별로 다른 릴리즈를 적용하면 cron 활성 상태를 다르게 가져갈 수 있다.
- `enabled: false`는 해당 env 릴리즈에서 job을 비활성화한다.

조건:
- `schedule` 또는 `every` 중 정확히 1개만 존재해야 한다.

검증 규칙(최소):
- `handler`는 존재하는 Custom Logic을 참조해야 한다.
- `every`는 24시간을 균등 분할해야 한다.

### 2.2 선언

```yaml
# cron/cleanup_expired_sessions.yaml
name: cleanup_expired_sessions
description: "만료된 세션 레코드 삭제"
schedule: "0 */6 * * *"         # 6시간마다 (cron 표현식)
# 또는
# every: 6h                    # 주기적 실행
handler: logics/cleanup_sessions   # Custom Logic 연동
connection: main
timeout: 30s                    # 최대 실행 시간
enabled: true                   # 환경별 비활성화 가능
```

### 2.3 제약

- 핸들러는 파라미터 없는 Custom Logic이어야 한다 (시스템 변수 `:now`, `:env` 등만 사용 가능).
- `every` 사용 시, 값이 24시간을 균등 분할해야 한다 (예: `1h`, `2h`, `6h`, `12h` — `7h`는 거부).
- 로컬 개발(`STK_DISABLE_AUTH=true`) 시에는 기본 비활성.
- Cron 실행 결과는 audit log에 기록한다.

### 2.4 CLI

```
stk cron list                      # 등록된 cron job 목록
stk cron status <name>             # 마지막 실행 상태, 다음 예정 시각
stk cron trigger <name>            # 수동 즉시 실행 (디버깅용)
```

---

## 3) 백엔드 구현 방향

### 3.1 Pub/Sub 백엔드

결정(MVP): Postgres 기반
- **PostgreSQL LISTEN/NOTIFY + polling 테이블** — 외부 메시지 브로커 없이 BYO DB만으로 동작.
- `stk_events` 테이블에 이벤트를 적재하고, Bridge가 polling으로 소비.

향후:
- **외부 브로커 연동**: Redis Streams, NATS, Kafka 등을 connection으로 등록.
- Outbox 패턴: CRUD 트랜잭션 내에서 이벤트를 `stk_outbox` 테이블에 적재 → 별도 relay가 브로커에 전달.

### 3.2 Cron 백엔드

- Bridge 내부 스케줄러가 cron job을 실행한다.
- 멀티 Bridge 인스턴스 환경에서 중복 실행 방지: `stk_cron_locks` 테이블로 분산 락.
- 실행 기록: `stk_cron_history` 테이블 (시작 시각, 종료 시각, 결과, 에러).

---

## 4) 릴리즈 통합

- 토픽/구독/Cron 선언은 릴리즈 스냅샷에 포함된다.
- `stk apply` 시 `events/`, `cron/` 디렉토리의 YAML도 함께 반영된다.
- 릴리즈 rollback 시 이전 토픽/구독/Cron 설정으로 복원된다.

### 4.1 의미(결정)

- Bridge는 요청 처리 및 백그라운드 워커(pubsub/cron) 동작 시점에 "현재 릴리즈"를 기준으로 설정을 해석한다.
- 릴리즈 포인터가 바뀌면, 다음 polling 이후 Bridge는 새로운 토픽/구독/cron 구성을 적용한다.

### 4.2 롤백/승격 시나리오(예시)

예: prod에서 cron job을 비활성화하고 싶다.
1) prod에 적용할 릴리즈에서 `cron/cleanup_expired_sessions.yaml`에 `enabled: false`
2) `stk apply --env prod --ref <ref>`
3) Bridge polling 이후 해당 cron이 더 이상 스케줄되지 않는다.

예: 문제 발생 시 rollback
1) `stk release rollback --env prod --to <previousReleaseId>`
2) Bridge polling 이후 이전 릴리즈의 cron/topic/subscription 구성이 복원된다.

### 4.3 in-flight 처리(최소 규칙)

- 릴리즈 변경 시점에 이미 실행 중인 handler는 중단하지 않는다.
- 릴리즈 변경 이후 시작되는 실행부터 새로운 설정을 적용한다.

---

## 5) 이것이 필요한 이유

현재 Santokit은:
- Auto CRUD = 동기 CRUD 요청만 처리
- Custom Logic = 동기 SQL 실행만 처리

하지만 실제 서비스에서는:
- "주문 생성 → 이메일 발송 → 재고 갱신" 같은 비동기 워크플로우가 필수
- "만료 데이터 정리", "일일 통계 집계" 같은 정기 작업이 필수

외부 도구(AWS Lambda, CloudWatch Events 등)에 의존하면 Santokit의 "선언적 BaaS" 가치가 훼손된다.

---

## 미결정

- Pub/Sub MVP를 PostgreSQL 기반으로 할 것인가, 아니면 처음부터 외부 브로커를 지원할 것인가
- Exactly-once 전달 보장의 구현 범위 (MVP에서는 at-least-once만?)
- 이벤트 스키마 진화(schema evolution) — 필드 추가/제거 시 기존 구독자 호환성
- 이벤트 리플레이(replay) 지원 여부
- Cron 실패 시 알림 채널 (이메일, Slack, webhook)
- WebSocket/SSE 기반 실시간 이벤트 스트림을 클라이언트에 노출할 것인가
