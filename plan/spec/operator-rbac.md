# Operator RBAC — Spec (요약)

목표:
- Hub(Control Plane)의 Operator 역할/권한 체계를 정의한다.
 - 현재 `auth.md`에 "org/project 단위 RBAC"으로만 기술된 부분을 구체화한다.

---

## 1) 역할 정의

### 1.1 Org 레벨

| 역할 | 설명 |
|------|------|
| **owner** | Org 전체 관리. 결제, 멤버 관리, Org 삭제. Org당 최소 1명. |
| **admin** | Project 생성, 멤버 초대/제거, 환경 관리. Org 삭제 불가. |
| **member** | 할당된 Project 내에서 작업. Org 수준 관리 불가. |

`member`는 기본적으로 읽기 권한만 갖고, project-level 역할 부여로 권한이 확장된다.

### 1.2 Project 레벨

| 역할 | 설명 |
|------|------|
| **admin** | 환경/연결정보/API 키/스키마/권한/릴리즈 전체 관리. |
| **deployer** | 스키마/권한 apply, 릴리즈 생성/promote/rollback. 연결정보/키 관리 불가. |
| **viewer** | 읽기 전용. 스키마/권한/릴리즈 조회만 가능. |

---

## 2) 권한 매트릭스

### 2.1 Project 작업

| 작업 | project:admin | project:deployer | project:viewer |
|------|:---:|:---:|:---:|
| 환경 생성/삭제 | O | X | X |
| DB 연결정보 등록/수정/삭제 | O | X | X |
| API 키 생성/폐기 | O | X | X |
| 스키마 plan/apply | O | O | X |
| 권한 apply | O | O | X |
| 릴리즈 create/promote/rollback | O | O | X |
| 스키마/권한/릴리즈 조회 | O | O | O |
| End User OIDC provider 관리 | O | X | X |

### 2.2 역할 상속

- Org owner/admin은 모든 하위 Project에 대해 암묵적 project:admin 권한을 가진다.
- 명시적 Project 역할이 있으면 org 상속보다 우선한다.

### 2.3 Effective Role 계산(예시)

우선순위(높음 → 낮음):
1. project-level 명시 역할
2. org-level 상속 역할

예시 1:
- Alice가 `org:admin`이면, 어떤 project든 최소 `project:admin`으로 취급된다.

예시 2(override):
- Carol이 `org:admin`이더라도 특정 project에 대해 명시적으로 `project:viewer`를 부여하면
  - 그 project에서는 `viewer`가 우선한다.
  - 이 override는 "임시 제한" 또는 "읽기 전용" 계정에 사용한다.

### 2.4 Action Catalog (초안)

CLI 명령 기준으로 "최소 요구 역할"을 정의한다.

| Scope | Action | 최소 역할 |
|-------|--------|----------|
| org | org members 조회 | org:member |
| org | org members 변경(초대/제거/역할 변경) | org:admin |
| project | connections 관리(set/test/list/show) | project:admin |
| project | apikey 관리(create/revoke/list) | project:admin |
| project | apply(스키마/권한/릴리즈) | project:deployer |
| project | release promote/rollback | project:deployer |

규칙:
- 읽기 전용 조회는 기본적으로 `viewer`에 허용한다.
- destructive 또는 secret 접근은 `admin`에만 허용한다.

### 2.5 CI/자동화 주체(결정)

- MVP에서는 "사람이 아닌 Hub Operator 계정"(Service Account)을 별도로 모델링하지 않는다.
- CI/CD 자동화는 Operator RBAC이 아니라 **Project API key**(Data Plane) 또는 "CI에서의 `stk` 실행"(Operator token)으로 처리한다.

---

운영 UX(초대/수락/역할 변경)와 관련된 커맨드 네이밍은 `plan/spec/cli.md`에서 다룬다.
미결정 항목은 `plan/notes/open-questions.md`에서 관리한다.
