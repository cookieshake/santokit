# Multi-Project Support (Bridge) — Options & Recommendation

문제:
- Bridge가 “여러 프로젝트(=여러 manifest/bundle)”를 한 런타임에서 서빙해야 하는가?
- Hub-less 전제에서, 프로젝트별 secrets/DB 연결까지 어떻게 분리할 것인가?

핵심 관찰:
- **진짜 멀티테넌트(다수 프로젝트를 한 Bridge에서 서빙)** 는 “manifest 로딩”만의 문제가 아니라
  - 프로젝트 라우팅(어떤 요청이 어떤 프로젝트인지)
  - 프로젝트별 DB credentials / storage credentials (secrets)
  - 캐시/레이트리밋/로그/감사 격리
  까지 함께 풀어야 한다.

---

## Option A) Per-Project Deployment (권장, v1)

정의:
- 프로젝트마다 Bridge를 별도로 배포한다.
- 결과적으로 Bridge는 **single-project runtime** 이며, manifest는 bake-in 또는 단일 원격 소스만 사용한다.

장점:
- secrets 분리/회전이 배포 플랫폼 기능으로 자연스럽게 해결됨
  - Cloudflare: Worker secrets는 “Worker 단위”이므로 프로젝트별 Worker 배포가 가장 깔끔
  - Docker/K8s: 프로젝트별 Deployment/Namespace로 분리 가능
- 보안/격리/운영이 단순 (권한/캐시/로그/리소스)
- `stk deploy cfworker` / `stk deploy image`가 “프로젝트 단위 릴리즈”로 깔끔해짐

단점:
- 프로젝트 수가 많으면 배포 리소스가 늘어남

스펙(v1 제안):
- `stk deploy cfworker --name <project>`: 프로젝트별 Worker를 생성/배포
- `stk deploy image --tag <project>:<sha>`: 프로젝트별 이미지 빌드/푸시
- Client SDK는 프로젝트별 baseUrl을 사용(=프로젝트 선택 로직 불필요)

---

## Option B) Single Shared Bridge (멀티 프로젝트 런타임)

정의:
- 한 Bridge 인스턴스가 여러 프로젝트의 manifest/bundle을 로드해 `/call`을 처리한다.

필수 설계 요소:
1) Project Resolution
- `Host` 기반: `<project>.api.example.com`
- header 기반: `X-Santokit-Project: <id>`
- token 기반: JWT claim `project_id`

2) Manifest/Bundle Storage
- Cloudflare: KV/R2에 `manifest:{project}` / `bundle:{project}:{hash}`
- Node: S3/R2/FS에 동일 키 구조

3) Secrets Problem (가장 큰 이슈)
- 배포 플랫폼 secrets는 “런타임 단위”라 프로젝트별로 다르게 주입하기 어렵다.
- 대안:
  - (B1) 프로젝트별 DB creds를 “외부 Secret Manager”에서 project id로 조회
  - (B2) KV에 encrypted secrets를 저장하고, Bridge는 단일 마스터키로 복호화
    - 이 순간 Bridge가 사실상 “미니 Hub/Vault” 역할을 하게 됨

장점:
- 인프라 효율(한 런타임에 여러 프로젝트)

단점/리스크:
- secrets/격리/보안이 급격히 어려워짐 (Hub-less의 장점 상당 부분 상실)
- 운영 요구사항(감사/레이트리밋/과금)이 곧바로 튀어나옴

---

## Recommendation (v1)

v1에서는 **Option A(프로젝트별 Bridge 배포)** 로 간다.
- “multi project(manifest)” 요구는 배포 플랫폼에서 “프로젝트별 런타임”으로 충족한다.
- 나중에 진짜 멀티테넌트가 필요해지면 Option B로 확장하되,
  그 시점에는 Hub-less 원칙을 재검토(또는 외부 Secret Manager 강제)해야 한다.

---

## Open Questions

1) 프로젝트별 baseUrl 형태를 어떻게 할까?
- `https://<project>.example.com` (권장)
- `https://api.example.com/<project>` (경로 기반)

2) “프로젝트”의 단위는 무엇인가?
- 하나의 manifest + 하나의 DB alias set
- 또는 하나의 프로젝트가 multiple DB(main=pg, cache=libsql) 가질 수 있음

