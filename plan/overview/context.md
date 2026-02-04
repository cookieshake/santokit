# Context (2026-02-04)

## 목표(초안)
Santokit을 "플랫폼"으로 재구성한다:
- CLI(`stk`)로 프로젝트/환경/연결정보/권한/릴리즈를 Hub(Control Plane)로 관리
- Hub(Control Plane)가 연결정보/권한/스키마 스냅샷/릴리즈를 관리
- Bridge(Data Plane)가 `/call`로 Auto CRUD를 실행 (Node/Docker 런타임 어댑터)

## 리포 상태(관찰)
- 현재 워크스페이스에는 `plan/`, `.moon/`, `.flox/`만 존재하고, `packages/*`가 없다.
  - `.moon/workspace.yml`는 `packages/*/moon.yml`을 프로젝트 글롭으로 기대한다.
  - 따라서 "재창조" 작업은 사실상 **모노레포 패키지/빌드 파이프라인부터 재구축**이 선행돼야 한다.

## 스펙 상 명확한 갭(우선순위 후보)
- OAuth 기반 `stk login`/Hub OAuth: 문서상 🟡/❌ (MVP 이후)
- Hub Auth의 실제 유저/비밀번호 검증/토큰 무효화: 문서상 "단순 토큰 발급" 수준 (MVP 이후)
- End User JWT(OIDC) + owner/RLS: 🟡 (Phase 2+)
- Secrets 키 로테이션/재암호화: 🟡 (보안 강화 단계)
- 런타임 어댑터 품질 편차(Cloudflare/Node 등): 🟡 (운영 단계, v1 제외)

## 제안: MVP의 정의(초안)
다음이 한번에 동작하면 "첫 번째 재구축"을 성공으로 본다:
1. Hub(Control Plane): 프로젝트/환경/연결정보/권한/릴리즈 + schema snapshot 관리
2. CLI(`stk`): `project/env/connections/permissions/releases/schema snapshot`를 CLI로 조작
3. Bridge(Data Plane, Node 우선): `POST /call`로 Hub에서 릴리즈 pull/캐시 → Auto CRUD 실행
4. 검증: role 불일치/환경 불일치가 `403`으로 차단되고, CRUD가 정상 동작

## 합의가 필요한 질문(다음 턴에서 결정)
1) 이번 재창조의 1차 목표는 무엇인가?
- "로컬에서 end-to-end 개발 경험(MVP)" vs "Cloudflare Edge 중심" vs "SaaS 운영(멀티테넌트)"

2) 데이터베이스/스토리지 기본 선택은?
- Postgres(필수) + Redis(선택) + S3/R2(선택) 조합으로 고정할지

3) Auto CRUD는 반드시 1차에 포함해야 하는가?
- 포함하면 Bridge/권한/스키마 인트로스펙션 범위가 크게 늘어난다.
  - 결정: v1(Slim)에서 포함(핵심 기능)
