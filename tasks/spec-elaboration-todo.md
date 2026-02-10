# Spec Elaboration Todo Table

이 문서는 "요약 스펙"(현재 `plan/spec/*.md`)을 다음 단계의 "구체 스펙"으로 확장하기 위한 작업 목록이다.

원칙:
- 구현(코드 변경) 작업은 포함하지 않는다.
- 각 항목의 산출물은 "문서 업데이트"(스펙 본문/예시/흐름/오픈퀘스천 정리)다.
- 모든 결정은 `plan/notes/open-questions.md`에서 "질문" → "결정"으로 이동시키고, 스펙 본문에 반영한다.

상태 값:
- `todo` / `in_progress` / `blocked` / `done`

---

| ID | Spec | Topic | Output (Doc Change) | Inputs/Refs | Priority | Status |
|----|------|-------|---------------------|------------|----------|--------|
| GEN-001 | Global | 문서 공통 템플릿 확정(용어/범위/MVP/비MVP/에러/예시/미결정) | `plan/spec/*`에 적용 가능한 공통 섹션 가이드 추가(또는 `plan/README.md`에 규약) | 기존 `plan/spec/*.md` 스타일 | P0 | done |
| GEN-002 | Global | 용어/글로서리 업데이트(Operator/End User/Service token/release payload 등) | `plan/spec/final.md` 또는 별도 `plan/spec/glossary.md` 추가 | `final.md`, 각 신규 스펙 | P1 | done |
| GEN-003 | Global | 에러 코드 카탈로그 초안(문자열 코드, HTTP status, 의미, 예시) | 새 문서 `plan/spec/errors.md` + 각 스펙에서 참조 | `final.md`의 에러 포맷 | P1 | done |
| GEN-004 | Global | 플로우 문서/통합테스트 매핑 갱신 | `plan/flows/*.md`에 신규 흐름(Observability/RBAC 등) 섹션 추가 | `plan/flows/*`, `tests/integration_py/README.md` | P1 | done |

| BHP-101 | bridge-hub-protocol | Hub internal API surface 확정(경로/쿼리/응답 JSON/ETag) | `plan/spec/bridge-hub-protocol.md`에 API 계약 표(Req/Res 예시 포함) 추가 | `plan/spec/final.md` 4.4/5.1 | P0 | done |
| BHP-102 | bridge-hub-protocol | 인증 모델 결정(service token vs mTLS) + 토큰 로테이션/배포 방식 | 스펙에 위협모델/운영 절차(회전/폐기/유출 대응) 추가 | `plan/notes/open-questions.md` | P0 | done |
| BHP-103 | bridge-hub-protocol | 캐시/동기화 semantics 구체화(TTL, max-stale, cold start, multi-tenant) | 상태 전이 다이어그램/표 추가 | `plan/spec/final.md` 멀티 프로젝트 | P0 | done |
| BHP-104 | bridge-hub-protocol | 장애 모드/리트라이 정책(backoff, jitter, timeouts) 구체화 | 재시도 규칙/타임아웃 표준 섹션 추가 | `observability.md`(로그/메트릭) | P1 | done |
| BHP-105 | bridge-hub-protocol | Hub HA 발견(여러 hubUrl)과 클라이언트 라우팅 전략 결정 | "지원/비지원" 명시 + 지원 시 정책 추가 | `open-questions.md` | P2 | done |

| OBS-101 | observability | Healthz/Readyz 계약(성공 조건/코드/응답 포맷) 확정 | `plan/spec/observability.md`에 JSON 예시/규칙 추가 | `final.md` runtime | P0 | done |
| OBS-102 | observability | 메트릭: 메트릭 이름/라벨/버킷 표준 + cardinality 가이드 | Prometheus naming/label 규칙 섹션 추가 | `observability.md` | P0 | done |
| OBS-103 | observability | 트레이싱: span 이름/attribute/샘플링/PII 마스킹 정책 확정 | OTEL 섹션에 "데이터 노출 정책" 추가 | `open-questions.md`(SQL 노출) | P0 | done |
| OBS-104 | observability | 로그: 공통 JSON 스키마(필드/레벨/민감정보 마스킹) 확정 | Logging 섹션 확장(필드 목록 + 금지 필드) | `auth.md`(토큰), secrets 모델 | P1 | done |
| OBS-105 | observability | Audit log: 이벤트 taxonomy/스키마/조회 API/retention 구체화 | `observability.md` Audit 섹션을 별도 문서로 분리 여부 결정 | `final.md`(audit 언급) | P1 | done |

| RBAC-101 | operator-rbac | 역할 집합 확정(Org/Team/Project) + 상속/우선순위 규칙 | `plan/spec/operator-rbac.md`에 결정사항/예시 추가 | `auth.md` 2) Operator | P0 | done |
| RBAC-102 | operator-rbac | 권한 매트릭스 구체화(엔드포인트/CLI 커맨드 단위로) | "Action catalog" 섹션 추가 | `cli.md`, `final.md` | P0 | done |
| RBAC-103 | operator-rbac | 초대 플로우(토큰/만료/수락) 및 실패 케이스 정의 | 시퀀스(텍스트) + 에러 케이스 표 추가 | `errors.md`(GEN-003) | P1 | done |
| RBAC-104 | operator-rbac | Service Account/CI 계정 모델 포함 여부 결정 | 지원 시 별도 섹션, 미지원 시 명시 | `open-questions.md` | P2 | done |
| RBAC-105 | operator-rbac | RBAC 변경 시 Audit log 이벤트 설계 연결 | `observability.md`와 cross-ref 추가 | OBS-105 | P1 | done |

| SDK-101 | client-sdk | 생성 결과의 "repo 구조 반영"을 formal spec으로 고정(모듈 구조/이름 규칙) | `plan/spec/client-sdk.md`에 canonical 구조 + 규칙/충돌 처리 상세화 | `schema.md`(table 유니크), logics path 규칙 | P0 | done |
| SDK-102 | client-sdk | API shape 결정(테이블별 클래스 vs 함수형, query builder 범위) | TS MVP 설계 선택지/결정 기록 | `crud.md` 요청 형식 | P0 | done |
| SDK-103 | client-sdk | 타입 매핑의 edge cases(nullability, json, decimal, bytes, file) 구체화 | 각 타입별 직렬화 규칙 + 예시 추가 | `schema.md`, `open-questions.md`(bytes/decimal) | P1 | done |
| SDK-104 | client-sdk | permissions 반영 범위 결정(클라이언트에서 컬럼 숨김? 런타임 에러만?) | 지원/비지원 명시 + 기대 UX 정의 | `crud.md` column ACL | P2 | done |
| SDK-105 | client-sdk | 버전/호환성 정책(릴리즈 ID embed 여부, 브레이킹 감지) 결정 | "Compatibility" 섹션 추가 | `releases` 모델 | P1 | done |

| MCP-101 | mcp | 노출 tool 최소 세트/MVP 범위 결정(읽기 전용 원칙 포함) | `plan/spec/mcp.md`에 MVP/비MVP 구분 | Encore MCP 분석 | P0 | done |
| MCP-102 | mcp | 각 tool의 request/response schema 확정(예시 포함) | 도구별 계약 표 추가 | `bridge-hub-protocol.md`(release fetch) | P0 | done |
| MCP-103 | mcp | 보안 정책 구체화(민감정보 필터링, row limit, timeout, RBAC 연계) | "Security" 섹션 확장 + 금지 항목 명시 | `operator-rbac.md`, secrets 모델 | P0 | done |
| MCP-104 | mcp | 세션 내 project/env 전환 지원 여부 결정 | 지원/비지원 + UX/명령 설계 | `cli.md` context | P2 | done |

| EVT-101 | events | 파일 레이아웃/스키마 확정(topics/subscriptions/triggers/cron) | `plan/spec/events.md`에 final YAML schema + 필수/옵션 정의 | 기존 `schema/*.yaml` 스타일 | P0 | done |
| EVT-102 | events | 실행 semantics(MVP): at-least-once, retry, DLQ, idempotency 가이드 | 이벤트 처리/중복 처리 원칙 섹션 추가 | Encore pubsub 리트라이/DLQ | P0 | done |
| EVT-103 | events | 트리거(테이블 insert/update/delete → 이벤트) 문법 확정 | 트리거 DSL을 별도 섹션으로 정리 + 예시 | `crud.md` op 정의 | P1 | done |
| EVT-104 | events | Cron 문법 확정(cron vs every, 24h 분할 규칙, env별 enable) | cron YAML schema + 검증 규칙 추가 | Encore cron 제약 | P1 | done |
| EVT-105 | events | 백엔드 선택지 문서화(Postgres 기반 vs 외부 브로커) + 결정 | MVP 결정을 명확히 기록(비결정이면 옵션 비교표) | `open-questions.md` | P0 | done |
| EVT-106 | events | 릴리즈 통합(스냅샷/롤백) 정확한 의미 정의 | releases 섹션에 state machine/예시 추가 | `final.md` release pointer | P1 | done |

---

리뷰 체크리스트(각 스펙 공통)
- MVP 범위와 비MVP 범위가 명확한가
- 요청/응답 예시(JSON/YAML)가 최소 1개 이상 있는가
- 실패 케이스와 에러 코드가 정의되어 있는가
- 보안/민감정보 정책이 명시되어 있는가
- `open-questions.md`에 남겨둘 것과 본문에 결정할 것이 분리되어 있는가
