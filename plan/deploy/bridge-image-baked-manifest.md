# Bridge Image With Baked Manifest (Spec Sketch)

목표:
- Hub의 “manifest registry/provisioning” 없이도 배포가 가능하도록,
  Bridge OCI 이미지에 **manifest + bundle**을 포함(bake-in)한다.
- (선택) Hub는 secrets/vault 같은 “운영 편의” 기능만 유지할 수 있다.

---

## 1) Artifact Layout (inside OCI image)

권장 경로(예시):
- `/app/bridge/` : Bridge 런타임 코드
- `/app/santokit/manifest.json`
- `/app/santokit/bundle.tgz` (또는 unpacked `/app/santokit/logic/**`)

런타임 환경변수:
- `SANTOKIT_MANIFEST_PATH=/app/santokit/manifest.json`
- `SANTOKIT_BUNDLE_PATH=/app/santokit/bundle.tgz` (또는 directory)

---

## 2) Deploy Flow

1) 개발자가 로직/스키마/설정을 수정
2) `stk bundle`:
   - `manifest.json` 생성(로직 인덱스, 메타데이터, 스키마 버전 등)
   - `bundle.tgz` 생성(실행 코드 + 메타)
3) `stk deploy image --tag <registry>/<name>:<gitsha>`:
   - Bridge base image에 manifest/bundle을 COPY
   - push
4) 배포 플랫폼에서 해당 이미지를 실행(rollout/rollback은 이미지 태그로)

---

## 3) Runtime Behavior (Bridge)

부팅 시:
1) `manifest.json` 로드 (파일 I/O)
2) (선택) `bundle.tgz`를 메모리로 로드하거나 요청 시 lazy load
3) `/call`에서 `path`로 로직을 찾고 실행

장점:
- Hub 장애/네트워크 없이도 실행 가능
- 버전 핀ning이 명확(이미지 태그)

제약:
- “실시간 최신”은 없다. 업데이트는 이미지 재빌드/재배포로만.

---

## 4) What About Secrets?

결정(2026-02-04): Hub-less (플랫폼 secrets)
- Bridge는 secrets를 “배포 플랫폼”이 env로 주입
- Hub 불필요

주의:
- 어떤 모델이든, “secrets를 이미지에 bake-in”은 금지(유출/로테이션 불가)

---

## 5) What About `stk sync` (Client Types)?

Hub manifest가 없어도 가능:
- `stk sync`는 로컬의 `dist/manifest.json`(또는 repo 내 manifest)로 타입을 생성한다.
- 또는 `stk sync --image <tag>`가 레지스트리에서 manifest만 추출(옵션, 추후)

---

## 6) Open Decisions

1) Hub를 남긴다면: secrets만? projects/auth도?
2) Bridge가 Hub secrets를 fetch할 때 인증 방식:
- 프로젝트 토큰(정적) vs 단기 토큰(OIDC) vs mTLS
3) secrets refresh/rotation 정책:
- 부팅 시 1회 vs TTL 캐시 + 백그라운드 refresh
