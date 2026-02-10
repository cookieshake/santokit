# Plan 문서 개선 체크리스트 (라운드 2)

이 문서는 2차 점검에서 식별된 22개 항목을 우선순위별로 정리한 실행 체크리스트다.

## 확정 결정사항

- `:auth.roles` (복수형)으로 통일
- P1 스펙 공백은 혼합 전략 적용
  - 단순 항목: 스펙 본문에 초안 반영
  - 복잡 항목: `plan/notes/open-questions.md`로 이관
- `plan/flows/logics.md` 전체를 한국어로 통일

## P0 (충돌/정확성)

- [x] `plan/flows/logics.md`
  - `:auth.role` → `:auth.roles`로 수정

- [x] `plan/overview/context.md`
  - 비목표 문구 정정: Custom Logic(선언형 SQL 함수)은 지원, 범용 앱 런타임(JS/Python)만 범위 밖으로 명시

- [x] `plan/flows/auth.md`
  - 로그아웃 요청 포맷 통일: `project/env` 방식 제거, `refreshToken` 기반으로 통일
  - 쿠키 모드에서는 서버가 쿠키의 refresh token을 읽는다고 명시

- [x] `plan/README.md`
  - 존재하지 않는 `plan/deploy/` 제거
  - `plan/implement/` 추가(구현 기술 스택/아키텍처)
  - Entry Points에 `plan/implement/stack.md` 추가

- [x] `plan/spec/cli.md`
  - Section 6에 `stk release promote`, `stk release rollback` 추가
  - Section 3에 `--only` 다중 값 지원(`--only permissions,release`) 명시

## P1 (스펙 공백 보강)

- [x] `plan/spec/logics.md`
  - Section 1: frontmatter `connection`(optional, 기본 `main`) 라우팅 규칙 추가
  - Bridge가 해당 connection pool에서 SQL 실행함을 명시

- [x] `plan/spec/storage.md`
  - Section 2.3: `delete` 권한 모델 추가
  - `upload_sign`/`download_sign`와 동일한 roles + CEL condition 패턴 적용
  - 정책 YAML 예시에 `delete` 키 추가

- [x] `plan/spec/crud.md`
  - Section 2 `insert`: 응답 포맷 추가(`RETURNING *`, PK 포함 생성 row 반환)
  - 예시: `{"data": {"id": "...", "email": "..."}}`

- [x] `plan/notes/open-questions.md`
  - `bytes` JSON 직렬화 포맷(예: base64/hex) 추가
  - `decimal` precision/scale 파라미터 문법 추가

- [x] `plan/secrets/model.md`
  - Section 5 Connections에 `stk connections list`, `stk connections show` 추가

- [x] `plan/spec/crud.md`
  - Section 5 컬럼 권한 동작 명시
  - SELECT: 허용 컬럼만 조용히 필터링(403 없음)
  - INSERT/UPDATE: 비허용 컬럼 포함 시 403

- [x] `plan/spec/logics.md`
  - Section 2 응답 포맷 추가
  - row 반환 쿼리: `{"data": {"data": [...]}}`
  - execute-only: `{"data": {"affected": N}}`

- [x] `plan/spec/auth.md`
  - Section 7 기본 역할 정책 추가: Hub 내장 issuer 회원가입 시 기본 roles는 `["user"]`

## P2 (가독성/정리)

- [x] `plan/flows/logics.md`
  - 문서 전체 영문 → 한국어 번역

- [x] `plan/flows/logics.md`
  - References의 Rust 소스 라인번호(`:737-806` 등) 제거, 파일 경로만 유지

- [x] `plan/notes/open-questions.md`
  - 산재된 유보 의사결정 6건 이관
  - End-user auth UI (`auth.md`)
  - native array 타입 최적화 (`schema.md`)
  - cross-DB FK (`schema.md`)
  - nested expand (`crud.md`)
  - storage credential management CLI (`secrets/model.md`)
  - `resource.*` 일반 CEL 조건 지원 시점 (`crud.md`)

- [x] `plan/spec/auth.md`
  - `twin metadata` 용어를 `프론트매터(YAML 메타데이터)`로 교체

- [x] `plan/spec/final.md`
  - "지원 런타임(필수): Node/Docker"를
  - "배포 타겟(필수): 컨테이너(Docker) / VM(Node.js 환경)"으로 교체

- [x] `plan/spec/final.md`
  - SDK 목록에 `packages/sdks/python/` 추가

- [x] `plan/spec/schema.md`
  - `file` 타입 설명에 교차참조 추가: `상세: plan/spec/storage.md`

- [x] `plan/spec/crud.md`
  - `select` 용어 구분 주의문 추가
  - `params.select`(컬럼 선택)와 `op=select`(조회 연산) 구분 명시

## 대상 파일

- `plan/flows/logics.md`
- `plan/overview/context.md`
- `plan/flows/auth.md`
- `plan/README.md`
- `plan/spec/cli.md`
- `plan/spec/logics.md`
- `plan/spec/storage.md`
- `plan/spec/crud.md`
- `plan/notes/open-questions.md`
- `plan/secrets/model.md`
- `plan/spec/auth.md`
- `plan/spec/final.md`
- `plan/spec/schema.md`
