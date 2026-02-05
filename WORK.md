# Unimplemented / Gaps vs Spec

아래 항목은 구현 후 **완료**로 표시되었습니다.

## Hub (Control Plane)
- **Operator RBAC / Org-Team 모델** — 완료 (org/team/멤버십 테이블 추가, 프로젝트 접근 제어 적용)
- **Audit log 저장** — 완료 (주요 작업 감사 로그 기록)
- **Schema snapshot / drift 감지** — 완료 (`stk schema snapshot` + DB introspection 스냅샷 저장)
- **Release promote 검증** — 완료 (target env DB 스키마 호환성 검증)
- **End User 쿠키 발급** — 완료 (`stk_access_<project>_<env>` / `stk_refresh_<project>_<env>` 쿠키 발급/폐기)
- **외부 OIDC 연동** — 완료 (`/oidc/:provider/start`, `/oidc/:provider/callback`, provider 설정/redirect allowlist 저장/검증)
- **PASETO key rotation (kid)** — 완료 (footer kid 포함 + kid 기반 키 선택)

## Bridge (Data Plane)
- **Custom Logic(SQL)** — 완료 (`logics/*.sql` 로딩, frontmatter 파싱, auth/roles 검증, 파라미터 타입 검증, SQL 바인딩 실행)
- **Storage 정책 제약** — 완료 (`maxSize`, `allowedTypes`, `contentLength`, `contentType` 검증)
- **Schema 연동 Storage onDelete** — 완료 (file + cascade 시 S3 delete best-effort)

## CLI
- **`stk schema snapshot`** — 완료
- **OIDC/redirect allowlist 관리 명령** — 완료 (`stk oidc provider set/list`)

## 기타
- **Rate limiting / audit correlation** — 완료 (in-process rate limiting, request id header)

