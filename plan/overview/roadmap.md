# Rebuild Roadmap (Draft)

## Phase 0: Repo Bootstrapping (1-2일)
목표: 작업이 가능한 모노레포 뼈대를 만든다.

완료 기준:
- `packages/` 하위에 최소 4개 패키지 생성: `hub`, `cli`, `bridge`, `client`
- 각 패키지에 `moon.yml` + 기본 빌드/테스트 태스크 연결
- 루트에 `pnpm-workspace.yaml`(Node 패키지용) 또는 Go 워크스페이스 전략 결정

산출물(권장 파일):
- `packages/hub/...` (Go)
- `packages/cli/...` (Go)
- `packages/bridge/...` (TS)
- `packages/client/...` (TS)

리스크:
- 현재 리포에 기존 구현이 없어서, 문서 기반 "재구현" 비용이 발생한다.

## Phase 1: End-to-End MVP (로컬) (3-7일)
목표: 최소 기능을 실제로 연결해 "한 방에" 돌아가게 만든다.

스코프:
- 인증은 개발 편의상 `STK_DISABLE_AUTH=true`로 우회 가능
- Bridge(Data Plane)는 Node/Docker만 지원
- v1은 Auto CRUD만 포함(수동 SQL/커스텀 로직/SDK/CF Workers 제외)
- 스키마는 DB introspection snapshot을 사용한다(YAML 선언 스키마 plan/apply는 Phase 2+)
- Hub(Control Plane)가 프로젝트/환경/릴리즈/시크릿/연결정보의 Source of Truth가 된다(웹 콘솔 없이 CLI로만 조작)
- GitOps 전제: 프로젝트는 1개, env(dev/prod 등)로 승격(promotion)한다

완료 기준(데모 시나리오):
1. Hub(Control Plane) 실행
2. Bridge(Data Plane) 실행 (Node)
3. `stk project/env/connections` 설정
4. `stk schema snapshot`으로 인트로스펙션 스냅샷 생성
5. `stk permissions apply` + `stk release create`
6. `POST /call`로 `db/main/<table>/select` 호출 성공 + 권한 거부 케이스(`403`) 확인

테스트:
- 최소 1개의 통합 테스트(또는 스크립트)로 위 시나리오 자동 검증

## Phase 2: Security & Correctness (1-2주)
목표: "돌아간다"를 넘어 "안전하고 예측 가능"하게 만든다.

스코프:
- Hub Auth: 유저 저장, 비밀번호 해시(예: bcrypt/argon2), JWT claim 정리, 토큰 만료/갱신 정책
- Secrets: AES-256-GCM 키 로테이션/버전 관리(설계 + 최소 구현)
- Bridge: 권한 체크를 스펙에 맞게 엄격화(public/authenticated/role), private 로직 차단 보장
- 입력 검증/에러 규격화(공통 에러 코드)

완료 기준:
- 허용/거부 케이스 테스트(공개/인증/역할/프라이빗)
- 시크릿 평문이 로그/응답에 노출되지 않음(기본 방지)

## Phase 3: Multi-Runtime & Ops (1-2주)
목표: 운영 가능한 런타임/관측성을 갖춘다.

스코프:
- Cloudflare Workers 어댑터 (옵션, 필요 시)
- 캐시 정책을 스펙대로 고도화
- 로깅/트레이싱(요청 ID, 기본 구조화 로그)

완료 기준:
- Node/Cloudflare 둘 다 동일한 `/call` 계약으로 동작

## Phase 4: OAuth Login (옵션) (1주+)
목표: 문서의 🟡/❌ 영역을 완성한다.

스코프:
- Hub OAuth 엔드포인트 + 콜백 처리
- `stk login` 브라우저 플로우

완료 기준:
- `stk login`으로 토큰을 발급받아 `stk logic apply`가 동작

## Phase 5: Auto CRUD (중기) (2-4주)
목표: v1 Auto CRUD를 “실전 수준”으로 확장한다.

스코프:
- `db/{db}/{table}/{op}` 라우팅
- `config/permissions.yaml` 등 권한 모델 도입
- End User JWT(OIDC) + owner 기반 RLS
- where 표현식 확장(and/or/in/like)

## Phase 6: DX & Packaging (지속)
목표: 사용자가 "바로 쓰는" 경험 강화.

스코프:
- 예제 프로젝트/템플릿 추가
- 문서/CLI help 정리
- 버전 릴리즈 파이프라인
