# 03. CLI 명세 (`stk`) (Spec)

## 존재 의의
- 로컬 프로젝트를 Hub와 연결하는 **단일 실행점**
- 파일 스캔/파싱/배포/타입 생성의 자동화

## 공통 동작
1) `schema/`, `config/`, `logic/` 스캔
2) 형식 파싱 및 유효성 검사
3) Hub API 호출

## 상태 표기
- ✅ 구현됨
- 🟡 부분 구현
- ❌ 미구현

## 명령어별 목적/행동/동작

### `stk init`
- **존재 의의**: Santokit 프로젝트 구조를 빠르게 시작
- **행동**: 디렉토리 및 기본 파일 생성
- **동작**: `.stk/`, `schema/`, `config/`, `logic/`, `stk.config.json`, `tsconfig.json` 생성
- **상태**: ✅

### `stk profile`
- **존재 의의**: 여러 Hub 연결 정보를 관리
- **행동**: 프로파일 조회/설정/변경
- **동작**: `~/.santokit/config.json` 갱신
- **상태**: ✅

### `stk project`
- **존재 의의**: 현재 프로젝트 컨텍스트 지정
- **행동**: 프로젝트 ID, 토큰 설정
- **동작**: profile 저장 후 CLI 호출 시 사용
- **상태**: ✅

### `stk schema plan`
- **존재 의의**: 스키마 변경을 실제 적용 전 미리 검증
- **행동**: `schema/*.hcl` 읽어 Hub에 plan 요청
- **동작**: Hub가 Atlas 기반 diff 계산
- **상태**: ✅

### `stk schema apply`
- **존재 의의**: 스키마 변경 적용
- **행동**: plan 결과를 적용
- **동작**: Hub가 Atlas로 migration 실행
- **상태**: ✅

### `stk config apply`
- **존재 의의**: 프로젝트 설정을 Hub에 반영
- **행동**: `config/*.yaml` 업로드
- **동작**: Hub 저장소에 저장
- **상태**: ✅

### `stk logic apply`
- **존재 의의**: 로직 배포의 단일 진입점
- **행동**: 로직 파일 스캔/파싱/번들 생성 후 업로드
- **동작**:
  - SQL/JS 프론트매터 파싱
  - Twin File 모드 지원
  - 매니페스트 생성 후 Hub에 POST
- **상태**: ✅

### `stk sync`
- **존재 의의**: 최신 타입 정의와 매니페스트 동기화
- **행동**: Hub에서 매니페스트 다운로드
- **동작**: `codegen.output` 경로에 `santokit-env.d.ts` 생성
- **상태**: ✅

### `stk login`
- **존재 의의**: 로컬 개발자 로그인
- **행동**: 브라우저 OAuth 흐름 시작
- **동작**: 로컬 콜백 서버 실행 후 토큰 저장
- **상태**: 🟡 (Hub OAuth 미구현)

