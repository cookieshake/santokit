# Context (2026-02-04)

## 목표(초안)
Santokit을 "플랫폼"으로 재구성한다:
- CLI(`stk`)로 로직/스키마/설정을 Hub로 배포
- Hub(Control Plane)가 매니페스트/설정/시크릿/스키마를 관리
- Bridge(Data Plane)가 `/call`로 로직을 실행 (Edge/Server 런타임 어댑터)
- Client SDK가 타입 안전하게 호출 (`stk sync` 기반)

## 리포 상태(관찰)
- 현재 워크스페이스에는 `plan/`, `.moon/`, `.flox/`만 존재하고, `packages/*`가 없다.
  - `.moon/workspace.yml`는 `packages/*/moon.yml`을 프로젝트 글롭으로 기대한다.
  - 따라서 "재창조" 작업은 사실상 **모노레포 패키지/빌드 파이프라인부터 재구축**이 선행돼야 한다.

## 스펙 상 명확한 갭(우선순위 후보)
- OAuth 기반 `stk login`/Hub OAuth: 문서상 🟡/❌ (MVP 이후)
- Hub Auth의 실제 유저/비밀번호 검증/토큰 무효화: 문서상 "단순 토큰 발급" 수준 (MVP 이후)
- Auto CRUD & Permissions: 문서상 ❌ (중기)
- Edge 배포 키 관리/재암호화 키 관리: 🟡 (보안 강화 단계)
- 런타임 어댑터 품질 편차(Cloudflare/Node 등): 🟡 (운영 단계)

## 제안: MVP의 정의(초안)
다음이 한번에 동작하면 "첫 번째 재구축"을 성공으로 본다:
1. Hub: `POST/GET /api/v1/manifest`, `POST /api/v1/secrets`, `POST /api/v1/config/apply`, `POST /api/v1/schema/plan|apply` (로컬 개발에선 `STK_DISABLE_AUTH=true`)
2. CLI: `stk init`, `stk profile set/use`, `stk project set/auth set`, `stk logic apply`, `stk sync`
3. Bridge(Node 어댑터 우선): `POST /call`로 KV(또는 Hub)에서 최신 번들 로드 → SQL/JS 실행
4. Client: `createClient({ baseUrl })`로 `client.users.get({ ... })` 호출이 end-to-end로 성공

## 합의가 필요한 질문(다음 턴에서 결정)
1) 이번 재창조의 1차 목표는 무엇인가?
- "로컬에서 end-to-end 개발 경험(MVP)" vs "Cloudflare Edge 중심" vs "SaaS 운영(멀티테넌트)"

2) 데이터베이스/스토리지 기본 선택은?
- Postgres(필수) + Redis(선택) + S3/R2(선택) 조합으로 고정할지

3) Auto CRUD는 반드시 1차에 포함해야 하는가?
- 포함하면 Bridge/권한/스키마 인트로스펙션 범위가 크게 늘어난다.
