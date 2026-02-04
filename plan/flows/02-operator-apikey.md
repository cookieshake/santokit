# Flow 02 — Operator: Project API Key 발급/회전/폐기

목표:
- 서버/CI 등 “서비스 호출자”용 Project API key를 운영한다.

전제:
- Operator가 Hub(Control Plane)에 로그인했다.

---

## A. 키 생성

- (context 사용) `stk apikey create --name <name> --roles <role1,role2,...>`
- (명시) `stk apikey create --project <project> --env <env> --name <name> --roles <role1,role2,...>`

출력:
- `keyId=...`
- `apiKey=...` (생성 시 1회만 노출)

---

## B. 키 목록/상태 확인

- (context 사용) `stk apikey list`
- (명시) `stk apikey list --project <project> --env <env>`

권장 필드:
- `keyId`, `name`, `roles`, `status`, `createdAt`, `lastUsedAt`

---

## C. 무중단 회전(권장)

1) 새 키 생성
- `stk apikey create ...`

2) 서버/CI에 새 키 배포

3) 기존 키 폐기
- (context 사용) `stk apikey revoke --key-id <keyId>`
- (명시) `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

---

## D. 폐기(즉시 차단)

- (context 사용) `stk apikey revoke --key-id <keyId>`
- (명시) `stk apikey revoke --project <project> --env <env> --key-id <keyId>`
