# Remaining Gaps vs Spec

아래는 `plan/spec/*` 대비 아직 부족하거나 미구현으로 보이는 항목입니다.

## Hub (Control Plane)
- **Operator 관리 기능**: 초대/비활성화/역할 변경/프로젝트 팀 연결 API/CLI 추가. 완료.
- **Audit log 조회 API/CLI**: 조회/필터링 API + CLI 추가. 완료.
- **Schema snapshot 드리프트 비교**: 드리프트 비교 API/CLI + apply/release gate 연동. 완료.
- **Release promote 검증**: 스냅샷 기반 드리프트 체크 + dry-run 검증 추가. 완료.
- **OIDC issuer linking 고도화**: 동일 이메일 기반 계정 연결 로직 추가. 완료.
- **OIDC redirect allowlist 관리**: allowlist 검증 + provider 삭제/갱신 CLI 추가. 완료.

## Bridge (Data Plane)
- **Cookie access token 지원**: `stk_access_<project>_<env>` 쿠키 읽기 구현. 완료.
- **API key rotation 정책**: 다중 키 동시 활성(키 ID 기반 검증) 유지, 회전 시나리오 지원. 완료.
- **Request ID error 응답 연결**: 에러 응답에 `requestId` 포함. 완료.

## CLI
- **Audit log 조회 커맨드** 추가. 완료.
- **OIDC redirect allowlist 세부 관리**: provider delete 추가. 완료.

## 기타
- **Rate limiting 분산/영속화**: SQLite 기반 영속 스토어 옵션 추가. 완료.
- **Node/Docker 런타임 패키징**: Hub/Bridge Dockerfile 추가. 완료.
