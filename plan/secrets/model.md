# Secrets / Connections (Hub / Control Plane) — Spec

전제:
- Hub(Control Plane)는 필수다.
- 웹 콘솔 없이 `stk`(CLI)로만 관리한다.
- BYO DB 연결정보는 “비밀”로 취급한다.

목표:
- 멀티 팀/프로젝트/환경에서 DB 연결정보를 안전하게 저장/회전/감사할 수 있어야 한다.
- Bridge는 요청의 `project+env`에 맞는 연결정보만 사용할 수 있어야 한다.

---

## 1) Source of Truth

- secrets/연결정보의 Source of Truth는 Hub다.
- Git/manifest/bundle/image에 secret 값을 포함하지 않는다.

---

## 2) Data Model (최소)

Hub는 최소한 아래를 가진다:
- `project`
- `env` (예: `dev`, `stg`, `prod`)
- `connection` (예: `main`)
  - `engine` (예: `postgres`)
  - `encryptedConfig` (예: `DB_URL` 등)

---

## 3) Encryption (최소)

원칙:
- Hub DB에는 secret “평문”을 저장하지 않는다.
- Hub는 서버 환경변수로 주입된 마스터키로 암복호화한다(대칭키).
- 감사로그에는 “값”이 아니라 “키 이름/connection id/actor(keyId)”만 남긴다.

---

## 4) Bridge Behavior

- Bridge는 요청을 처리할 때 `project+env` 컨텍스트를 확정한 뒤,
  Hub에서 해당 환경의 connection을 조회/캐시한다.
- 캐시 TTL은 짧게(예: 1~10분) 두고, 키 회전/폐기 시 빠르게 반영되도록 한다.

---

## 5) CLI Commands (Draft)

기본 원칙:
- 모든 명령은 `--project <project> --env <env>`를 명시적으로 받는다(스크립트/CI 친화).
- `connection` 이름은 기본값으로 `main`을 권장한다.

Bootstrap:
- `stk project create <project>`
- `stk env create --project <project> <env>`

Connections:
- `stk connections set --project <project> --env <env> --name <connection> --engine postgres --db-url <...>`
- `stk connections test --project <project> --env <env> --name <connection>`

Rotation:
- `stk connections rotate --project <project> --env <env> --name <connection>`
