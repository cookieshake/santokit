---
trigger: always_on
---

# Santoki Project Guide

## 필수 참고 문서

코드 작성 및 수정 시 다음 문서를 반드시 참고하세요:

- **API 스펙**: `.context/API-SPEC.md` - 모든 API 엔드포인트의 입력/출력/동작/제약사항
- **UI 스펙**: `.context/SPEC-UI.md` - UI 페이지 구조, 컴포넌트, 동작 방식

## 개발 규칙

### 빌드 및 테스트
- 코드 변경 후에는 `npm run build`를 통해 프로젝트가 잘 빌드되는지 확인한다.
- 새로운 기능 추가 시 관련 테스트 코드를 작성한다.

### API 설계
- `project_id`의 경우 header를 통해 제공받고, 나머지는 url을 통해 제공받는다.
- Header 이름처럼 공통적으로 관리되어야 하는 변수의 경우 `constants.ts`에 저장한 값을 사용하고, 하드코딩하지 않는다.
- API 엔드포인트 추가/수정 시 `.context/SPEC-API.md`를 함께 업데이트한다.

### 데이터베이스
- PostgreSQL을 포함한 다양한 DB에 연결될 가능성을 고려하여 코드를 작성한다.
- DB 접근은 반드시 repository 레이어를 통해서만 한다.
- 직접 SQL을 작성하지 않고 Kysely query builder를 사용한다.

### UI 개발
- UI 변경 시 `.context/SPEC-UI.md`를 함께 업데이트한다.
- Bulma CSS 프레임워크의 기본 클래스를 우선 사용한다.
- 커스텀 CSS는 최소화하고, 필요시 인라인 스타일보다 Bulma utility 클래스를 사용한다.

### 코드 스타일
- 되도록이면 간결하게 작성한다.
- 함수는 단일 책임 원칙을 따른다.
- 매직 넘버나 매직 스트링은 상수로 정의한다.

### 보안
- 사용자 입력은 항상 검증한다 (Zod 스키마 사용).
- SQL injection 방지를 위해 parameterized query를 사용한다.
- 민감한 정보(비밀번호, 토큰 등)는 로그에 출력하지 않는다.