# Audit Log — Spec

목표:
- Hub(Control Plane)에서 발생하는 운영 변경 이력을 일관된 형태로 기록한다.
- 문제 분석/컴플라이언스/보안 감사를 지원한다.

관련:
- 관측 전반: `plan/spec/observability.md`
- Operator 권한: `plan/spec/operator-rbac.md`
- 에러 코드: `plan/spec/errors.md`

---

## 1) 이벤트 범위

Audit log는 "운영자가 Hub를 통해 수행하는 변경"과 "시스템이 운영 상태를 바꾸는 이벤트"를 기록한다.

대상 이벤트(카테고리):

| 카테고리 | 이벤트 |
|---------|--------|
| 프로젝트 | 생성, 삭제, 설정 변경 |
| 환경 | 생성, 삭제 |
| DB 연결 | 등록, 수정, 삭제 |
| 스키마 | plan, apply(성공/실패), drift 감지 |
| 권한 | permissions apply, 변경 내역 |
| 릴리즈 | 생성, promote, rollback |
| API 키 | 생성, 폐기 |
| End User 인증 | OIDC provider 등록/삭제, 대량 role 변경 |
| Operator | 로그인, 초대, 역할 변경, 탈퇴 |

---

## 2) Action Naming

원칙:
- `domain.verb` 형태를 기본으로 한다.
- verb는 과거형이 아니라 동작 이름으로 고정한다.

예:
- `project.create`
- `env.create`
- `connection.set`
- `schema.plan`
- `schema.apply`
- `permissions.apply`
- `release.create`
- `release.promote`
- `release.rollback`
- `apikey.create`
- `apikey.revoke`
- `operator.login`
- `rbac.invite`
- `rbac.set_role`

---

## 3) 저장 스키마 (Hub 내부 DB)

```
  id          BIGINT PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    TEXT NOT NULL,           -- operator account id
  actor_type  TEXT NOT NULL,           -- 'operator' | 'system' | 'bridge'
  action      TEXT NOT NULL,           -- 'schema.apply', 'release.create', ...
  project     TEXT,
  env         TEXT,
  detail      JSONB,                   -- action-specific payload (민감정보 금지)
  ip          TEXT
)
```

규칙:
- `detail`에는 secret/token/db-url 값을 포함하지 않는다.
- `detail`에는 가능한 한 "무엇이 바뀌었는지"가 남도록 한다(예: before/after hash, releaseId 등).

---

## 4) 조회 인터페이스

### 4.1 CLI

```
```

권장 출력 필드:
- `ts`, `actorId`, `actorType`, `action`, `project`, `env`, `requestId`(있으면), `detail` 요약

### 4.2 API (초안)

- `GET /audit?project=...&env=...&action=...&since=...&limit=...`

성공(200) 응답 예시:
```json
{
  "items": [
    {
      "ts": "2026-02-10T09:30:00Z",
      "actorId": "op_123",
      "actorType": "operator",
      "action": "release.promote",
      "project": "myapp",
      "env": "prod",
      "detail": { "fromEnv": "dev", "releaseId": "rel_01H..." }
    }
  ]
}
```

실패:
- RBAC 거부 시 `403 FORBIDDEN`

---

## 5) 보존 정책

- 기본: 90일 보존
- 설정: `STK_AUDIT_RETENTION_DAYS`
- 만료 레코드는 주기적으로 삭제 (Hub 내부 cron)

---

## 미결정

- Audit log 외부 스트리밍 (S3, SIEM 연동) 지원 시점
