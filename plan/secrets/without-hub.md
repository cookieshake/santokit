# Secrets Without Hub (Targets: Node/Docker + Cloudflare Workers)

전제:
- Hub는 제거한다.
- secrets는 Git에 저장하지 않는다.
- secrets의 Source of Truth는 **배포 타겟의 Secret Manager**다.

목표:
- 로컬 개발과 배포(Node/Docker, Cloudflare Workers)에서 동일한 “secret 참조” 모델을 제공한다.

---

## 1) Secret Reference Model (Spec)

로직/설정에서는 값 자체가 아니라 “이름”만 참조한다.

예:
- `DB_URL` (postgres 연결 문자열)
- `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN`
- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`

런타임에서의 해석:
- Bridge는 `process.env.<NAME>`(Node) 또는 `env.<NAME>`(Cloudflare)에서 읽는다.

---

## 2) Local Dev (No Hub)

MVP 권장:
- `.env.local` (gitignore) + direnv(or dotenv)로 주입
- `stk`는 다음을 제공:
  - `stk secrets validate` : 필요한 secret 이름들이 모두 세팅되어 있는지 점검
  - `stk secrets template` : `.env.local` 템플릿 생성

---

## 3) Deploy: Cloudflare Workers

secrets 저장소:
- Cloudflare Worker secrets (wrangler secrets)

배포 동작(스펙):
- `stk deploy cfworker`는 다음을 수행한다:
  1) Worker 번들(Bridge CF adapter + manifest/bundle) 빌드
  2) `wrangler deploy` 실행(또는 Cloudflare API 호출)
  3) 필요한 secret 이름 목록을 출력하고, 누락 시 배포를 실패시키거나 경고한다

secrets 셋업 방식(옵션):
- A) 사용자가 직접 `wrangler secret put <NAME>` 실행
- B) `stk deploy cfworker --set-secret <NAME>`처럼 interactive로 위임(내부적으로 wrangler 호출)

중요:
- manifest/bundle은 이미지처럼 bake-in 가능하지만, **secrets는 절대 bake-in 금지**

---

## 4) Deploy: Node/Docker

secrets 저장소:
- Docker/K8s secrets 또는 `.env`/CI secrets

배포 동작(스펙):
- `stk deploy image`는 Bridge 이미지에 manifest/bundle을 포함(bake-in)한다.
- secrets는 런타임에서 환경변수로 주입한다.

---

## 5) Open Decisions

결정(2026-02-04):
- `stk`는 **wrangler를 직접 호출**해서 `stk deploy cfworker`를 end-to-end로 자동화한다.
- 단, 파괴적/민감 액션은 반드시 **사용자 확인(prompt)** 을 받는다:
  - 배포(`wrangler deploy`)
  - secret 설정/갱신(`wrangler secret put`)

2) secret naming convention:
- 그대로 `DB_URL` 같은 이름을 쓸지
- `SANTOKIT_DB_URL`처럼 prefix를 강제할지
