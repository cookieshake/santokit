# 통합 테스트 취약 영역 점검 (최신)

> 갱신일: 2026-02-10

현재 `tests/integration_py/tests/` 기준으로 총 22개 테스트가 존재한다.

---

## 1) 현재 커버리지 스냅샷

| 테스트 파일 | 테스트 수 | 핵심 범위 |
|---|---:|---|
| `test_operator.py` | 5 | 부트스트랩, API key, schema/permissions apply, release promote/rollback |
| `test_auth.py` | 3 | Hub issuer 로그인, OIDC provider 등록, 멀티 프로젝트 로그인 |
| `test_crud.py` | 4 | CRUD 기본/고급, expand, pagination/sorting |
| `test_security.py` | 3 | CEL 조건, column prefix, column permissions |
| `test_logics.py` | 7 | Custom Logic 호출/권한/파라미터/에러 케이스 |

강점:
- CRUD/보안/Custom Logic의 핵심 Happy path는 이미 넓게 커버됨.
- 운영자 기본 플로우(프로젝트/환경/릴리즈)도 기본 시나리오는 확보됨.

---

## 2) 최신 코드 변경 대비 미흡한 테스트

아래는 최근 구현 완료 항목 대비, 아직 테스트가 부족한 영역이다.

### P0 (바로 보강 권장)

1. **Insert 응답 포맷 단일화 검증** ✅ 완료
   - 변경점: `db/*/insert` 응답이 `{"data": {...}}`로 단일화됨
   - 반영: `tests/integration_py/tests/test_crud.py`에 응답 shape 검증 추가
   - 검증: `data` 객체/`id` 존재, legacy 키(`ids`, `generated_id`) 부재, 서버생성 ID에 수동 `id` 입력 시 `400`

2. **`resource.*` 조건 SQL 필터 변환 회귀 테스트** ✅ 완료
   - 변경점: 단순 동등식(`resource.<col> == <literal|request.auth.sub>`) 지원
   - 반영: `tests/integration_py/tests/test_security.py`에 literal/미지원 연산 케이스 추가
   - 검증: literal equality 필터 동작(200), 미지원 연산(`!=`) 에러 메시지 검증(400)

3. **Array 재귀 타입 검증 테스트** ✅ 완료
   - 변경점: insert/update 시 array 요소 타입 재귀 검증 추가
   - 반영: `tests/integration_py/tests/test_crud.py`에 `test_crud_array_validation` 추가
   - 검증: `items: string/int` 정상 입력(200), 타입 불일치 insert/update(400)

### P1 (다음 스프린트)

4. **`stk connections show`/`rotate` CLI E2E 테스트**
   - 변경점: 신규 커맨드 추가
   - 부족한 점: 통합 테스트에서 커맨드 성공/출력/반영 확인 부재
   - 권장 추가: rotate 후 `connections test` 재검증 시나리오

5. **PASETO `kid` 식별 검증**
   - 변경점: access token footer에 `kid` 포함
   - 부족한 점: 발급 토큰의 footer 파싱 검증 부재
   - 권장 추가: 로그인/토큰재발급 응답 토큰에 `kid` 존재 확인

6. **`file onDelete: cascade` 비동기 정리 검증**
   - 변경점: delete 후 백그라운드 정리(`tokio::spawn`)
   - 부족한 점: 호출 지연 비차단 + eventual deletion 검증 없음
   - 권장 추가: 삭제 API 즉시 성공 + 짧은 polling으로 object 정리 확인

### P2 (중요하지만 후순위)

7. **Storage API 전체 플로우 (`upload_sign`/`download_sign`/`delete`)**
   - 현재도 전반적으로 미테스트 상태
   - 정책 매칭, condition 실패(403), content-length/type 제약 포함 필요

8. **Schema 고급 운영 시나리오**
   - `--force` 파괴적 변경
   - Drift detection에 따른 릴리즈 차단
   - Multi-connection 릴리즈/실행 경계

9. **Auth 수명주기 심화 테스트**
   - refresh token rotation/revoke 후 재사용 차단
   - 짧은 access TTL 정책 하 만료/재발급 경계
   - OIDC callback 완결(실제 교환 mocking 포함) 시나리오

---

## 3) 우선 실행할 테스트 추가 순서

1. `test_crud_response_shape.py` (insert 응답 스키마 회귀 방지)
2. `test_security_resource_conditions.py` (resource literal/unsupported 연산)
3. `test_crud_array_validation.py` (array 재귀 타입 검증)
4. `test_operator_connections_extra.py` (`show`/`rotate`)
5. `test_auth_token_kid_and_ttl.py` (`kid`, TTL 경계)
6. `test_storage_presign_and_cascade.py` (storage + 비동기 cascade)

---

## 4) 완료 기준

- 신규 테스트 파일은 기존 카테고리 규칙(`operator/auth/crud/security/logics`)에 맞춰 배치한다.
- 각 신규 테스트는 최소 1개 실패 케이스(4xx)를 포함한다.
- CI에서 반복 실행 시 flaky 없이 통과해야 한다.
