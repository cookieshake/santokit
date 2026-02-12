# Plan Review Follow-ups

이 문서는 `plan/` 문서를 다시 읽고 발견한 "추가로 구체화/결정이 필요한 항목"을 정리한다.
구현 작업은 포함하지 않는다.

상태 값:
- `todo` / `in_progress` / `blocked` / `done`

---

| ID | Area | Topic | Suggested Doc | Notes | Priority | Status | Completed |
|----|------|-------|---------------|-------|----------|--------|-----------|
| PR-001 | Events/Cron | Cron timezone/DST 규칙 확정(UTC 고정 여부) | `plan/spec/events.md` | 모든 schedule은 UTC 기준으로 확정. Section 2.2.1 추가 | P0 | done | 2026-02-10 |
| PR-002 | Events/Cron | Cron 표현식 스펙(5-field 고정인지, 초/년 지원 여부) | `plan/spec/events.md` | 5-field 표준 확정. 초/년 미지원. Section 2.2.1 추가 | P1 | done | 2026-02-10 |
| PR-003 | Events/Logics | 이벤트 payload 타입 검증/누락 시 에러 규칙(어느 단계에서 어떤 코드?) | `plan/spec/events.md`, `plan/spec/logics.md`, `plan/spec/errors.md` | 발행 시 400/SCHEMA_VALIDATION_FAILED, handler 실행 시 retry→DLQ. Section 1.3.2 추가 | P1 | done | 2026-02-10 |
| PR-004 | Observability | Correlation 규칙(로그 requestId ↔ trace/span id ↔ audit detail) 명확화 | `plan/spec/observability.md`, `plan/spec/audit-log.md` | requestId, traceId, spanId 연결 규칙 명확화. Section 4.3 추가, audit-log.md Section 3 갱신 | P1 | done | 2026-02-10 |
| PR-005 | Bridge↔Hub | `/internal/keys` 응답의 로깅/트레이싱 제외를 구체적으로(어떤 계층에서?) | `plan/spec/bridge-hub-protocol.md`, `plan/spec/observability.md` | HTTP 미들웨어 + OTEL span + 에러 로그 계층별 필터링 규칙 및 체크리스트 추가. Section 1.1.1 추가 | P1 | done | 2026-02-10 |
