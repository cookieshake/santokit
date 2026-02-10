# Plan Review Follow-ups

이 문서는 `plan/` 문서를 다시 읽고 발견한 "추가로 구체화/결정이 필요한 항목"을 정리한다.
구현 작업은 포함하지 않는다.

상태 값:
- `todo` / `in_progress` / `blocked` / `done`

---

| ID | Area | Topic | Suggested Doc | Notes | Priority | Status |
|----|------|-------|---------------|-------|----------|--------|
| PR-001 | Events/Cron | Cron timezone/DST 규칙 확정(UTC 고정 여부) | `plan/spec/events.md` | `schedule` 해석이 환경/노드에 따라 흔들리면 운영 이슈 | P0 | todo |
| PR-002 | Events/Cron | Cron 표현식 스펙(5-field 고정인지, 초/년 지원 여부) | `plan/spec/events.md` | 현재 "cron 표현식(5-field)"는 암시적 | P1 | todo |
| PR-003 | Events/Logics | 이벤트 payload 타입 검증/누락 시 에러 규칙(어느 단계에서 어떤 코드?) | `plan/spec/events.md`, `plan/spec/logics.md`, `plan/spec/errors.md` | handler가 요구하는 필드가 없을 때 처리 정책 필요 | P1 | todo |
| PR-004 | Observability | Correlation 규칙(로그 requestId ↔ trace/span id ↔ audit detail) 명확화 | `plan/spec/observability.md`, `plan/spec/audit-log.md` | 지금은 requestId 중심. trace id 표기/연결 규칙을 추가하면 좋음 | P1 | todo |
| PR-005 | Bridge↔Hub | `/internal/keys` 응답의 로깅/트레이싱 제외를 구체적으로(어떤 계층에서?) | `plan/spec/bridge-hub-protocol.md`, `plan/spec/observability.md` | 민감정보 필터링 체크리스트화 | P1 | todo |
