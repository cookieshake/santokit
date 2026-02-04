# Flow 06 — Operator: 스키마 변경 → plan/apply → 드리프트 차단(Release gate)

목표:
- 선언 스키마(YAML)를 변경하고 DB에 안전하게 반영한다.
- destructive 변경은 허용하지 않는다.
- DB가 수동 변경되어 드리프트가 생기면 릴리즈를 차단한다.

전제:
- 스키마 파일은 repo의 `schema/*.yaml`에 존재한다.

---

## A. 스키마 변경(PR)

1) `schema/*.yaml` 수정
2) PR 생성

---

## B. 검증/계획(plan)

권장:
- 스키마만 검증/plan을 보고 싶으면 `stk apply --only schema --dry-run`을 사용한다.

예:
- (context 사용) `stk apply --only schema --dry-run --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only schema --dry-run --ref <ref>`

멀티 connection 주의:
- 기본 동작은 `schema/*.yaml`에 선언된 모든 table(connection별)에 대해 plan을 생성한다.

3) destructive 포함 여부 확인
- destructive가 포함되면 plan은 “차단”되어야 한다.

---

## C. 적용(apply)

권장:
- 스키마 변경을 DB에 적용하려면 `stk apply --only schema`를 사용한다.

예:
- (context 사용) `stk apply --only schema --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only schema --ref <ref>`

---

## D. 드리프트 감지 및 릴리즈 차단

정책:
- DB 상태가 선언 스키마와 다르면 릴리즈를 차단한다.

운영 플로우:
1) 드리프트 원인 파악
2) (선택1) 선언 스키마에 반영 + plan/apply
3) (선택2) DB를 선언 스키마 상태로 복구 + plan/apply
4) 드리프트 해소 후 릴리즈 수행
