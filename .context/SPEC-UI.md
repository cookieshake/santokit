# UI Specification

## Overview
Santoki Admin의 웹 기반 관리 인터페이스입니다. 서버 사이드 렌더링(SSR)을 사용하며, Hono JSX와 Bulma CSS 프레임워크를 기반으로 구축되었습니다.

## Technology Stack
- **Framework**: Hono JSX (Server-Side Rendering)
- **CSS Framework**: Bulma 1.0.4
- **JavaScript**: Vanilla JS (클라이언트 사이드)
- **Rendering**: Server-Side Rendering (SSR)

---

## Page Structure

### 1. Login Page
**Route:** `/ui/login`

**Purpose:** 사용자 인증

**Layout:**
- 중앙 정렬된 로그인 폼
- Bulma의 `hero` 레이아웃 사용
- 풀 스크린 배경

**Components:**
- Email 입력 필드 (required, type: email)
- Password 입력 필드 (required, type: password)
- Sign In 버튼
- 에러 메시지 표시 영역

**Behavior:**
- 폼 제출 시 `/v1/auth/sign-in` API 호출
- 성공 시 `/ui`로 리다이렉트
- 실패 시 에러 메시지 표시

**Validation:**
- 클라이언트 사이드: HTML5 기본 검증 (required, email)
- 서버 사이드: API 레벨에서 검증

---

### 2. Projects List Page
**Route:** `/ui/projects`

**Purpose:** 모든 프로젝트 목록 조회 및 관리

**Layout:**
- 공통 레이아웃 (Layout 컴포넌트)
- 상단: 페이지 제목 + "New Project" 버튼
- 메인: 프로젝트 테이블

**Components:**

#### Header Section
- Title: "Projects"
- Action Button: "New Project" (모달 트리거)

#### Projects Table
| Column | Description |
|--------|-------------|
| ID | 프로젝트 TypeID |
| Name | 프로젝트 이름 |
| Actions | Manage 버튼, Delete 버튼 (system 프로젝트 제외) |

#### New Project Modal
- **Fields:**
  - Project Name (text, required)
- **Actions:**
  - Create: API 호출 후 페이지 리로드
  - Cancel: 모달 닫기

#### Delete Project Modal
- **Content:**
  - 프로젝트 이름 확인
  - "Also delete all data" 체크박스
  - 경고 메시지
- **Actions:**
  - Delete: API 호출 후 페이지 리로드
  - Cancel: 모달 닫기

**Behavior:**
- "New Project" 클릭 → 생성 모달 표시
- "Manage" 클릭 → 프로젝트 상세 페이지로 이동
- "Delete" 클릭 → 삭제 확인 모달 표시
- system 프로젝트는 삭제 불가

**API Calls:**
- `POST /v1/projects` - 프로젝트 생성
- `DELETE /v1/projects/:id?deleteData=true/false` - 프로젝트 삭제

---

### 3. Project Detail Page
**Route:** `/ui/projects/:id`

**Query Parameters:**
- `tab`: 활성 탭 선택 (overview, database)
- `db`: 선택된 데이터베이스 이름

**Purpose:** 프로젝트 상세 정보 및 데이터베이스/컬렉션 관리

**Layout:**
- 3단 레이아웃:
  1. Level 1 Sidebar: 기능 스위처 (Overview, Database, Storage)
  2. Level 2 Sidebar: 컨텍스트 메뉴 (탭별 네비게이션)
  3. Main Content: 탭별 컨텐츠

**Navigation:**

#### Level 1 Sidebar (Feature Switcher)
- **Overview Tab** (🏠 아이콘)
  - Route: `/ui/projects/:id`
  - 프로젝트 개요 및 데이터베이스 목록
- **Database Tab** (💾 아이콘)
  - Route: `/ui/projects/:id?tab=database`
  - 컬렉션 관리
- **Storage Tab** (📄 아이콘)
  - 비활성화 (Coming soon)

#### Level 2 Sidebar (Context Menu)

**Overview Tab:**
- Project → Overview (active)
- Project → Settings

**Database Tab:**
- Database 선택 드롭다운
- Collections 목록 (선택된 DB의 컬렉션)

**Tabs:**

#### Overview Tab
**Content:**
- Databases 테이블
  - Columns: Name, Connection, Actions
  - Actions: Delete 버튼
- Details 패널 (우측)
  - Project ID (readonly)
  - Created At (readonly)

**Actions:**
- "New Database" 버튼 → 데이터베이스 생성 모달

**New Database Modal:**
- Fields:
  - Database Name (alphanumeric + underscore)
  - Connection String (URL 형식)
- API: `POST /v1/projects/:id/databases`

#### Database Tab
**Content:**
- Collections 테이블
  - Columns: Name, Physical Name, Actions
  - Actions: Design 버튼
- 컬렉션 없을 시 안내 메시지

**Actions:**
- "New Collection" 버튼 → 컬렉션 생성 모달

**New Collection Modal:**
- Fields:
  - Collection Name (alphanumeric + underscore)
  - Primary Key Type (select: serial, uuid, typeid)
- API: `POST /v1/databases/:dbName/collections`
- SQL 확인 모달 표시

**Behavior:**
- 데이터베이스 선택 시 해당 DB의 컬렉션 목록 표시
- "Design" 클릭 → Collection Detail 페이지로 이동
- SQL 변경 작업 시 확인 모달 표시

---

### 4. Collection Detail Page
**Route:** `/ui/projects/:id/collections/:colName`

**Query Parameters:**
- `db`: 데이터베이스 이름

**Purpose:** 컬렉션의 데이터, 구조, 정책 관리

**Layout:**
- 3단 레이아웃 (Project Detail과 동일)
- 탭 기반 인터페이스 (Data, Structure, Policies)

**Breadcrumb:**
```
Projects > Project {id} > {collectionName}
```

**Tabs:**

#### Data Tab (기본 활성)
**Content:**
- 데이터 테이블
  - 동적 컬럼 (컬렉션 필드 기반)
  - NULL 값은 회색으로 표시
  - 객체는 JSON.stringify로 표시

**Actions:**
- "Insert Data" 버튼 → 데이터 삽입 모달

**Insert Data Modal:**
- 동적 필드 생성 (id, created_at, updated_at 제외)
- 각 필드에 타입 태그 표시
- API: `POST /v1/databases/:dbName/collections/:colName/records`

#### Structure Tab
**Content:**
- 2단 레이아웃:
  1. Fields 테이블
     - Columns: Name, Type, Nullable, Actions
     - Actions: Delete 버튼
  2. Indexes 패널
     - Index 이름 및 정의 표시

**Actions:**
- "Add Field" 버튼 → 필드 추가 모달

**Add Field Modal:**
- Fields:
  - Field Name (alphanumeric + underscore)
  - Type (select: text, integer, boolean, timestamp, jsonb)
  - Nullable (checkbox, default: checked)
- API: `POST /v1/databases/:dbName/collections/:colName/fields`
- SQL 확인 모달 표시

**Delete Field:**
- API: `DELETE /v1/databases/:dbName/collections/:colName/fields/:fieldName`
- SQL 확인 모달 표시

#### Policies Tab
**Content:**
- 2단 레이아웃:
  1. Existing Policies 테이블
     - Columns: Role, Action, Condition, Effect, Actions
     - Actions: Delete 버튼
  2. Create Policy 폼

**Create Policy Form:**
- Fields:
  - Role (text, required) - 예: user, admin, guest
  - Action (select, required) - create, read, update, delete
  - Condition (textarea, JSON, required) - 예: `{"owner_id": "$user.id"}`
  - Effect (radio, required) - allow (default), deny
- API: `POST /v1/databases/:dbName/policies`

**Delete Policy:**
- Confirmation dialog
- API: `DELETE /v1/databases/:dbName/policies/:id`

---

## Common Components

### Layout Component
**File:** `src/modules/ui/components/layout.tsx`

**Props:**
```typescript
{
  title: string;
  children: any;
  active: string;
  account?: any;
  projects?: any[];
  currentProjectId?: string;
  collections?: any[];
  currentDatabaseName?: string;
  databases?: any[];
  activeTab?: string;
}
```

**Features:**

#### Navbar
- **Brand:** "Santoki" 로고 (클릭 시 /ui/projects)
- **Project Dropdown:** 프로젝트 선택 드롭다운
- **Theme Toggle:** 다크/라이트 모드 전환 (🌙/☀️)
- **User Menu:** 사용자 정보 및 로그아웃

#### Sidebar System
- **Level 1:** 기능 스위처 (70px 고정 너비)
  - Discord 스타일 아이콘 버튼
  - 활성 상태: 파란색 배경 (#5865F2)
  - 비활성 상태: 회색 배경 (#313338)
- **Level 2:** 컨텍스트 메뉴 (220-260px)
  - 탭별 메뉴 표시
  - Bulma menu 컴포넌트 사용

#### SQL Confirmation Modal
- **Purpose:** SQL 실행 전 확인
- **Z-index:** 9999 (최상위)
- **Content:**
  - 경고 메시지
  - SQL 미리보기 (readonly textarea)
- **Actions:**
  - Execute SQL (위험 버튼)
  - Cancel

**Global Functions:**
```javascript
window.showModal(id)
window.hideModal(id)
window.toggleDropdown(id)
window.toggleTheme()
window.executeWithSqlConfirmation(url, options)
```

---

## Client-Side Behavior

### Theme Management
**Storage:** `localStorage.getItem('theme')`

**Values:**
- `'dark'`: 다크 모드
- `'light'`: 라이트 모드
- `null`: 시스템 설정 따름

**Implementation:**
- 페이지 로드 시 즉시 적용 (플래시 방지)
- `data-theme` 속성으로 HTML 요소 제어
- 토글 버튼으로 전환

### Modal Management
**Functions:**
- `showModal(id)`: `.is-active` 클래스 추가
- `hideModal(id)`: `.is-active` 클래스 제거

**Triggers:**
- 버튼 클릭
- 배경 클릭 (닫기)
- X 버튼 클릭 (닫기)
- Cancel 버튼 클릭 (닫기)

### Dropdown Management
**Functions:**
- `toggleDropdown(id)`: `.is-active` 클래스 토글

**Behavior:**
- 드롭다운 외부 클릭 시 모든 드롭다운 닫기
- 이벤트 버블링 방지

### SQL Confirmation Flow
1. API 호출 전 `executeWithSqlConfirmation(url, options)` 사용
2. Preview API 호출 (`?preview=true` 쿼리 파라미터)
3. SQL 미리보기 모달 표시
4. 사용자 확인 대기
5. 확인 시 실제 API 호출
6. 취소 시 Promise reject

**Usage:**
```javascript
const res = await window.executeWithSqlConfirmation(
  `/v1/databases/${dbName}/collections`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }
);
```

---

## Form Handling

### Standard Pattern
```javascript
document.getElementById('form-id').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorDiv = document.getElementById('error-div');
  errorDiv.style.display = 'none';
  
  try {
    const res = await fetch(url, options);
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json();
      errorDiv.textContent = data.error || 'Operation failed';
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = 'An error occurred';
    errorDiv.style.display = 'block';
  }
});
```

### Error Display
- 에러 메시지는 `.notification.is-danger` 클래스 사용
- 기본적으로 `display: none`
- 에러 발생 시 `display: block`으로 변경
- 새 요청 시 숨김

### Success Handling
- 대부분의 경우 `window.location.reload()` 사용
- 페이지 전체 리로드로 최신 데이터 반영

---

## Styling Guidelines

### CSS Framework
- **Bulma 1.0.4** CDN 사용
- 커스텀 CSS 최소화
- Bulma 기본 클래스 우선 사용

### Color Scheme
**Light Mode:**
- Background: Bulma 기본 색상
- Primary: `is-primary`, `is-link`
- Danger: `is-danger`
- Success: `is-success`

**Dark Mode:**
- `data-theme="dark"` 속성으로 제어
- Level 1 Sidebar: `#1a1b1e`
- Active Button: `#5865F2`
- Inactive Button: `#313338`

### Responsive Design
- Mobile: 사이드바 숨김 (`.is-hidden-mobile`)
- Desktop: 3단 레이아웃
- Bulma의 반응형 클래스 활용

### Icons
- SVG 아이콘 사용 (Feather Icons 스타일)
- Emoji 사용 (Theme Toggle, SQL Warning)
- 크기: 24x24px (기본)

---

## Navigation Flow

```
/ui/login
  ↓ (로그인 성공)
/ui → /ui/projects
  ↓ (프로젝트 선택)
/ui/projects/:id (Overview Tab)
  ↓ (Database Tab 클릭)
/ui/projects/:id?tab=database
  ↓ (컬렉션 선택)
/ui/projects/:id/collections/:colName?db=:dbName
```

### Breadcrumb Navigation
- Projects List: 없음
- Project Detail: `Projects > {projectName}`
- Collection Detail: `Projects > Project {id} > {collectionName}`

---

## Authentication

### Protected Routes
모든 `/ui/*` 경로는 인증 필요 (로그인 페이지 제외)

### Authentication Check
- 미들웨어에서 처리
- `c.get('account')` 로 사용자 정보 접근
- 인증 실패 시 로그인 페이지로 리다이렉트

### Logout
- Route: `/ui/logout`
- Cookie 삭제
- `/ui/login`으로 리다이렉트

---

## API Integration

### Headers
- `Content-Type: application/json` (POST/PUT 요청)
- `x-project-id: {projectId}` (프로젝트 컨텍스트 필요 시)

### Response Handling
**Success (200):**
- 페이지 리로드 또는 리다이렉트

**Error (4xx/5xx):**
```typescript
{
  error?: string;
  message?: string;
  details?: string;
}
```

### Common Patterns
- 생성 후 리로드
- 삭제 후 리로드
- 에러 시 모달 내 에러 표시

---

## Accessibility

### Semantic HTML
- `<nav>`, `<aside>`, `<section>` 사용
- `<table>` 구조 준수
- `<form>` 요소 사용

### ARIA Attributes
- `role="navigation"`
- `aria-label="main navigation"`
- Modal 닫기 버튼: `aria-label="close"`

### Keyboard Navigation
- 모든 인터랙티브 요소 포커스 가능
- Enter 키로 폼 제출
- Escape 키로 모달 닫기 (구현 필요)

---

## Performance Considerations

### Server-Side Rendering
- 모든 페이지 SSR
- 초기 로드 빠름
- SEO 친화적

### Client-Side JavaScript
- Vanilla JS 사용 (프레임워크 없음)
- 최소한의 클라이언트 로직
- 이벤트 위임 패턴 사용

### Data Loading
- 페이지 로드 시 모든 데이터 서버에서 렌더링
- 클라이언트에서 추가 API 호출 최소화
- 변경 후 전체 페이지 리로드

---

## Future Enhancements

### Planned Features
- **Storage Tab:** 파일 관리 기능
- **Settings Page:** 프로젝트 설정
- **Real-time Updates:** WebSocket 연동
- **Advanced Filtering:** 테이블 필터링/정렬
- **Pagination:** 대용량 데이터 처리

### Potential Improvements
- 클라이언트 사이드 라우팅
- 부분 페이지 업데이트 (AJAX)
- 더 나은 에러 핸들링
- 로딩 인디케이터
- Toast 알림

---

## File Structure

```
src/modules/ui/
├── components/
│   └── layout.tsx          # 공통 레이아웃 컴포넌트
├── pages/
│   ├── login.tsx           # 로그인 페이지
│   ├── projects.tsx        # 프로젝트 목록
│   ├── project-detail.tsx  # 프로젝트 상세
│   └── collection-detail.tsx # 컬렉션 상세
└── ui.controller.tsx       # UI 라우팅 컨트롤러
```

---

## Design Principles

1. **일관성:** Bulma 컴포넌트 일관되게 사용
2. **단순성:** 복잡한 클라이언트 로직 지양
3. **명확성:** 명확한 액션 버튼 및 레이블
4. **안전성:** 위험한 작업 전 확인 모달
5. **반응성:** 모바일 친화적 레이아웃
