# Flow 07 — Operator: 권한 변경(permissions.yaml) → 릴리즈

목표:
- 권한 정책을 GitOps로 변경하고 릴리즈로 반영한다.

전제:
- 권한 파일은 repo의 `config/permissions.yaml`에 존재한다.

---

## A. 권한 변경(PR)

1) `config/permissions.yaml` 수정
2) PR 생성

---

## B. 적용 및 릴리즈

권장:
- 권한만 반영하고 릴리즈까지 만들려면 `stk apply --only permissions,release`를 사용한다.

예:
- (context 사용) `stk apply --only permissions,release --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

멀티 connection 주의:
- `config/permissions.yaml`은 table 단위 정책을 가진다(예: `tables.users`).
- 각 table이 어떤 connection(DB)에 속하는지는 스키마(`schema/*.yaml`)에서 결정된다.

주의:
- 권한 변경은 End User 토큰의 `roles` 설계(토큰 TTL)와 상호작용한다.
  - 토큰에 `roles`가 포함되므로, “즉시 권한 변경”은 토큰 재발급/짧은 TTL이 필요할 수 있다.
