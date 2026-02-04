# Flow 08 — Operator/CI: 릴리즈 승격(Promotion) 및 롤백

목표:
- dev에서 검증된 릴리즈를 prod로 승격한다.
- 문제 발생 시 이전 릴리즈로 롤백한다.

---

## A. 승격(dev → prod)

- (current 승격) `stk release promote --project <project> --from dev --to prod`
- (명시 승격) `stk release promote --project <project> --to prod --release-id <releaseId>`

의미:
- dev의 릴리즈를 prod로 승격한다(릴리즈 포인터 이동).
- 승격은 DB에 스키마를 “적용”하지 않는다.
  - to env의 DB가 해당 릴리즈 schema와 호환/적용 완료 상태가 아니면 승격은 실패해야 한다.
  - 필요하면 먼저 `stk apply --project <project> --env prod --only schema --ref <ref>`로 스키마를 적용한다.
    - `ref`는 `stk release show --release-id <releaseId>`로 확인한다.

`releaseId`는 어디서 얻나:
- `releaseId`는 dev 환경에 대해 `stk apply`(또는 `stk apply --only ...,release`)가 성공했을 때 Hub가 생성/확정한다.
- 보통은 “current 승격”을 쓰면 되고, 특정 버전을 재승격/핀하고 싶을 때만 `--release-id`를 쓴다.
- 조회 방법(예시):
  - `stk release current --project <project> --env dev`
  - `stk release list --project <project> --env dev --limit 20`

---

## B. 롤백(prod)

- `stk release rollback --project <project> --env prod --to <previousReleaseId>`

의미:
- prod의 “현재 릴리즈” 포인터를 이전 릴리즈로 되돌린다.
