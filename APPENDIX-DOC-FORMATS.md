# 별첨: 문서 포맷 검토

Santokit 프로젝트의 스펙 문서화를 위해 검토한 포맷들을 정리한다.

## 목적별 문서 분류

| 용도 | 선정 후보 | 목적 |
|------|----------|------|
| 큰 그림 (아키텍처) | **Arc42** | 시스템 전체 구조를 한 눈에 |
| 코드 레벨 스펙 | **Gherkin** / **Gauge** / **IETF RFC** | 구현자가 바로 코드로 옮길 수 있는 상세 명세 |

## 검토한 전체 포맷

| 포맷 | 정식 명칭 | 등장 연도 | 특징 |
|------|----------|----------|------|
| IEEE 830 SRS | Software Requirements Specification | 1984 | 가장 공식적, 요구사항 나열. 형식이 과하게 무거움. |
| IETF RFC 2119 | MUST/SHOULD/MAY 키워드 스펙 | 1997 | 모호함 완전 제거. 테스트 자동화 연결 없음. |
| PRD | Product Requirements Document | ~2000s | "무엇을 왜 만드는가". 비즈니스 목표/사용자 스토리 중심. |
| TDD | Technical Design Document | ~2000s | "어떻게 만드는가". 아키텍처/데이터 모델/기술 결정. |
| Amazon PR-FAQ | Press Release / FAQ | ~2004 | 사용자 관점 역순 설계. 마케팅/방향성 정리용. |
| Arc42 | Architecture Documentation Template | 2005 | 12개 고정 섹션. 실용적, 커스터마이즈 가능. 아키텍처 문서 사실상 표준. |
| Robot Framework | Keyword-driven Testing | 2005 | 키워드 기반 테이블. 비개발자 친화적. |
| C4 Model | Context/Container/Component/Code | 2006 | 4단계 아키텍처 다이어그램. 시각화 중심. |
| Gherkin (BDD) | Given/When/Then 행동 명세 | 2006 | 가장 널리 쓰이는 행동 명세. E2E 테스트 자동화 연결 가능. |
| Concordion | Markdown/HTML + fixture | 2008 | 자유 형식 문서 안에 테스트 삽입. |
| Lean Canvas | 1-Page Business Model Canvas | 2010 | 9칸 캔버스. 문제/솔루션/핵심 지표. |
| ADR | Architecture Decision Record | 2011 | 주요 기술 결정과 근거를 개별 문서로 기록. |
| OpenAPI | API Specification (Swagger) | 2011 | API 엔드포인트 정의. 기계 판독 가능. |
| Gauge | Markdown-based Specification | 2014 | Gherkin보다 유연. ThoughtWorks 제작. Markdown 자유 형식. |
| SDD | Specification-Driven Development | 2025 | AI가 스펙을 읽고 코드 생성. 자연어 마크다운. 최신 트렌드. |

## 큰 그림 포맷: Arc42

### 왜 Arc42인가
- 12개 섹션으로 빠짐없이 구조화
- 아키텍처 문서 분야 사실상 표준 (2005~현재)
- 필요한 섹션만 골라 쓸 수 있음
- 대안(TOGAF, ArchiMate)은 규모 대비 과함

### Santokit에 필요한 섹션

| # | 섹션 | 필요 여부 | 비고 |
|---|------|----------|------|
| 1 | 소개와 목표 | O | 요구사항 개요, 품질 목표, 이해관계자 |
| 2 | 제약사항 | O | Postgres, Rust, QuickJS 등 |
| 3 | 컨텍스트 | O | 시스템 경계, 외부 연동 |
| 4 | 솔루션 전략 | O | 핵심 기술 선택 근거 |
| 5 | 빌딩 블록 뷰 | O | 내부 모듈 구조 |
| 6 | 런타임 뷰 | O | 주요 흐름 (CRUD, OAuth 등) |
| 7 | 배포 뷰 | O | Docker, 환경변수 |
| 8 | 횡단 관심사 | O | 인증, 에러 처리, 마이그레이션 |
| 9 | 아키텍처 결정 | △ | ADR로 분리 가능 |
| 10 | 품질 시나리오 | △ | |
| 11 | 리스크 | △ | |
| 12 | 용어집 | △ | |

## 코드 레벨 스펙 포맷: 후보

### 1. Gherkin (Given/When/Then)
```gherkin
Feature: 포스트 CRUD

  Scenario: 인증된 유저가 포스트를 생성한다
    Given 유저 "홍길동"이 로그인되어 있다
    When POST /api/posts 요청을 보낸다:
      | title | body       |
      | 안녕  | 첫 글입니다 |
    Then 응답 코드는 200이다
    And 응답에 "id"가 포함되어 있다
```
- 장점: 구조화, 테스트 자동화 직결
- 단점: 형식이 딱딱, 복잡한 시나리오에서 장황

### 2. Gauge (Markdown 기반)
```markdown
# 포스트 CRUD

## 인증된 유저가 포스트를 생성한다

* 유저 "홍길동"으로 로그인한다
* POST "/api/posts" 요청을 보낸다
  |title|body|
  |안녕|첫 글입니다|
* 응답 코드는 "200"이다
* 응답에 "id"가 포함되어 있다
```
- 장점: Markdown 자유 형식, Gherkin보다 유연
- 단점: Gherkin보다 생태계가 작음

### 3. IETF RFC 스타일 (MUST/SHOULD/MAY)
```markdown
## 1.2 Fields
리소스는 `fields` 섹션을 포함할 수 있다(MAY).
각 필드는 다음 타입 중 하나여야 한다(MUST):
text, number, decimal, boolean, timestamp, enum, file.
배열 필드로 정렬해서는 안 된다(MUST NOT).
```
- 장점: 모호함 완전 제거, AI/사람 모두 명확히 해석
- 단점: 테스트 자동화 직접 연결 안 됨

## 현재 결론

논의 중. 최종 조합 미결정.
