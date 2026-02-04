# Hub-less / CLI-Centric Deploy (Review)

질문:
- Hub를 없애고, Hub의 역할을 `stk`(CLI) + CI/CD + 런타임 설정으로 대체할 수 있나?
- `stk deploy image` 같은 방식(OCI 이미지 빌드/배포)이 더 나은가?
- 특히: **Hub 이미지를 빌드하는 게 아니라, Bridge 이미지를 빌드하고 그 안에 manifest/bundle을 넣는 방식**이 가능한가?

결론(요약):
- **가능**하다. “BaaS(Control Plane) 제품”이 아니라 “배포 도구/프레임워크”로 재정의하면 특히 잘 맞는다.
- 다만 Hub가 제공하던 **Secrets/환경 분리/팀 권한/감사/릴리즈 제어**가 사라지므로, 그 역할을 어디에 둘지(플랫폼/CI/외부 Secret Manager) 명확히 해야 한다.

---

## 1) Hub가 하던 일(요약)

- Manifest/Bundle registry: 최신 번들 저장/서빙
- Secrets(Vault): 암호화 저장/조회
- Schema plan/apply: DB diff/적용(Atlas 등)
- Config 저장: DB/auth/storage 설정
- Projects/Auth: 사용자/프로젝트 관리, 토큰/JWT/OAuth

---

## 2) Hub를 없애면 “무엇이 바뀌나”

### A) 배포/번들 흐름
기존:
- `stk logic apply` → Hub `POST /manifest` → Hub가 최신 번들을 저장/프로비저닝

Hub-less:
- `stk bundle`(또는 `stk deploy image`)가 **번들+매니페스트를 생성**하고,
  - (선택1) OCI 이미지로 패키징해 레지스트리에 푸시
  - (선택2) tarball로 S3/R2/GitHub Releases 등에 업로드
- Bridge는 배포 시점에:
  - `BUNDLE_URL`(tarball) 또는 `IMAGE_TAG`(image)로 버전을 핀하고 로드

### B) Secrets 흐름
기존:
- `stk secret set` → Hub 저장 → Bridge가 런타임에서 복호화 사용

Hub-less 대체안:
- “Secrets는 플랫폼 책임”으로 넘긴다:
  - Docker/K8s secrets, GitHub Actions secrets, 1Password, Vault, AWS/GCP secret manager, Cloudflare secrets 등
- `stk`는 secrets를 저장하지 않고,
  - `.env` 템플릿 생성/검증
  - 배포 대상 플랫폼에 secrets를 세팅하는 헬퍼를 제공(예: wrangler 호출)
  - 단, secret 설정/갱신은 반드시 사용자 확인(prompt)을 받는다

### C) Schema plan/apply
기존:
- Hub가 BYO DB에 직접 연결해서 plan/apply

Hub-less:
- `stk schema plan/apply`가 직접 DB에 연결해 수행(로컬/CI)
- “승인/릴리즈”는 PR/CI 파이프라인으로 대체

### D) Config
기존:
- Hub가 config를 저장하고 Bridge/CLI가 조회

Hub-less:
- config는 Git에 커밋(`config/*.yaml`)
- 런타임은 env/configmap으로 주입

### E) Auth/Projects
기존:
- Hub가 사용자/프로젝트/토큰을 발급/검증

Hub-less:
- MVP에선 “앱/플랫폼의 인증”을 그대로 사용:
  - Bridge는 `Authorization`을 검증하지 않거나(개발모드),
  - 외부 JWT issuer(예: Auth0/Supabase/Clerk 등)로 검증(Bridge에 JWKS 설정)

---

## 3) `stk deploy image` 모델(권장안)

핵심:
- Bridge 런타임 + Logic bundle + manifest(+ 선택적으로 permissions/config)를 **하나의 OCI 이미지**로 묶는다.

대략 흐름:
1) `stk bundle` → `dist/santokit-bundle.tgz` + `dist/manifest.json`
2) `stk deploy image --tag myapp:sha-<gitsha>`:
   - base 이미지(bridge 런타임)를 사용해
   - 번들+manifest를 이미지에 포함(bake-in)
   - 레지스트리에 push
3) 사용자는 배포 플랫폼에서 해당 이미지를 실행
    - secrets는 플랫폼이 주입
    - DB URL/token 등도 플랫폼 secrets로 주입

장점:
- “latest 번들” 문제가 깔끔해짐: 이미지 태그가 곧 릴리즈
- 롤백이 단순: 이전 태그로 돌리면 끝
- Hub 가용성/운영이 사라짐

주의:
- “런타임 중 live update”는 기본적으로 없다(이미지 교체가 배포)
- 엣지(KV) 기반 실시간 프로비저닝에 비해 배포 주기가 길 수 있음

### Bridge 이미지에 manifest를 bake-in 했을 때의 동작 변화(중요)
- Bridge는 부팅 시 `MANIFEST_PATH`(예: `/app/manifest.json`)를 읽어 로직 인덱스를 구성한다.
- Hub에서 manifest를 pull하지 않으므로:
  - `GET /manifest` 같은 API 의존이 사라진다.
  - 배포/릴리즈의 단위가 “Hub latest”가 아니라 **이미지 태그**가 된다.
- 결과적으로 Hub는 (있다면) “시크릿/프로젝트 관리” 같은 control 기능만 남게 된다.

---

## 4) Hub-less가 괜찮은 조건 / 위험한 조건

### Hub-less가 “괜찮은” 경우
- 제품을 BaaS라기보다 “배포/개발 도구”로 포지셔닝
- 단일 조직/단일 프로젝트 위주
- secrets/환경 분리/권한은 이미 배포 플랫폼에서 잘 관리하고 있음

### Hub-less가 “위험한” 경우
- 멀티테넌트 SaaS를 목표로 함(팀/프로젝트/권한/감사/과금)
- 웹 콘솔이 필요함(프로젝트/릴리즈/시크릿/로그 관리)
- “Edge로 즉시 프로비저닝” 같은 컨트롤 플레인 기능이 핵심

---

## 5) Recommendation (현 시점)

우리가 이미 결정했던 것:
- secrets 때문에 Hub가 필요하다고 느꼈다.

다만 아래가 사실이라면 Hub-less가 더 낫다:
- secrets를 Hub가 아니라 **배포 플랫폼**에 맡겨도 된다.
- 릴리즈/롤백은 이미지 태그/CI로 충분하다.

---

## 6) Decision Questions

1) Santokit의 정체성은?
- A) BaaS/Control Plane 제품(=Hub 중심)
- B) Deploy tool/framework(=Hub-less 가능)

2) Secrets는 누가 “Source of Truth”인가?
- A) Hub(Vault) (제품 내 관리)
- B) 배포 플랫폼/Secret Manager (제품 외부 관리)

3) 배포 단위는 무엇인가?
- A) Hub에 업로드되는 bundle(런타임은 latest를 pull)
- B) OCI image(tag가 release)

4) Hub를 남긴다면, Hub의 “manifest” 책임은 유지할까?
- A) 유지(Bridge는 Hub에서 pull; 이미지 bake-in은 옵션)
- B) 제거(Bridge는 bake-in만; Hub는 secrets 중심)
