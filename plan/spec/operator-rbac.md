# Operator RBAC — Spec (요약)

목표:
- Hub(Control Plane)의 Operator 역할/권한 체계를 정의한다.
- 현재 `auth.md`에 "org/team/project 단위 RBAC"으로만 기술된 부분을 구체화한다.

Encore 참고:
- Encore는 **Admin / Member / Viewer** 3단계 역할을 제공한다.
  - Admin: 팀 관리, 클라우드 계정, GitHub 연동, 환경 설정, 인증 키, 인프라 승인, 삭제 등 전체 관리.
  - Member: 코드 푸시, 배포, 시크릿 설정 가능.
  - Viewer: 읽기 전용 대시보드, 로컬 실행, 시크릿 pull만 가능.
- Encore Pro에서는 커스텀 역할을 지원한다.
- Encore의 모든 인프라 변경에는 **RBAC 기반 승인**이 적용되며, 감사 로그에 기록된다.
- Santokit은 org > team > project의 3계층 구조이므로, Encore의 flat한 역할 모델보다 **스코프별 역할 상속**을 설계해야 한다.

---

## 1) 역할 정의

### 1.1 Org 레벨

| 역할 | 설명 |
|------|------|
| **owner** | Org 전체 관리. 결제, 멤버 관리, Org 삭제. Org당 최소 1명. |
| **admin** | Team/Project 생성, 멤버 초대/제거, 환경 관리. Org 삭제 불가. |
| **member** | 할당된 Team/Project 내에서 작업. Org 수준 관리 불가. |

### 1.2 Team 레벨

| 역할 | 설명 |
|------|------|
| **lead** | Team 내 Project 생성, 멤버 추가/제거, Project 설정 변경. |
| **member** | Team 내 할당된 Project에서 작업. Team 관리 불가. |

### 1.3 Project 레벨

| 역할 | 설명 |
|------|------|
| **admin** | 환경/연결정보/API 키/스키마/권한/릴리즈 전체 관리. |
| **deployer** | 스키마/권한 apply, 릴리즈 생성/promote/rollback. 연결정보/키 관리 불가. |
| **viewer** | 읽기 전용. 스키마/권한/릴리즈/로그 조회만 가능. |

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
| Audit log 조회 | O | O | O |
| End User OIDC provider 관리 | O | X | X |

### 2.2 역할 상속

- Org owner/admin은 모든 하위 Team/Project에 대해 암묵적 project:admin 권한을 가진다.
- Team lead는 소속 Team 내 모든 Project에 대해 암묵적 project:admin 권한을 가진다.
- 명시적 Project 역할이 있으면 상속보다 우선한다.

### 2.3 Effective Role 계산(예시)

우선순위(높음 → 낮음):
1. project-level 명시 역할
2. team-level 상속 역할
3. org-level 상속 역할

예시 1:
- Alice가 `org:admin`이면, 어떤 project든 최소 `project:admin`으로 취급된다.

예시 2:
- Bob이 team `payments`에서 `team:lead`이고, `payments` 소속 project `billing`에 대해 명시 role이 없다면
  - `billing`에 대해 `project:admin`으로 취급된다.

예시 3(override):
- Carol이 `org:admin`이더라도 특정 project에 대해 명시적으로 `project:viewer`를 부여하면
  - 그 project에서는 `viewer`가 우선한다.
  - 이 override는 "임시 제한" 또는 "감사/관찰 전용" 계정에 사용한다.

### 2.4 Action Catalog (초안)

CLI 명령 기준으로 "최소 요구 역할"을 정의한다.

| Scope | Command | 최소 역할 |
|-------|---------|----------|
| org | `stk org invite ...` | org:admin |
| org | `stk org remove ...` | org:admin |
| org | `stk org members ...` | org:member |
| team | `stk team invite ...` | team:lead |
| team | `stk team remove ...` | team:lead |
| team | `stk team members ...` | team:member |
| project | `stk connections set/test ...` | project:admin |
| project | `stk apikey create/revoke ...` | project:admin |
| project | `stk apply --only schema ...` | project:deployer |
| project | `stk apply --only permissions,release ...` | project:deployer |
| project | `stk release promote/rollback ...` | project:deployer |
| project | `stk audit list ...` | project:viewer |

규칙:
- 읽기 전용 조회는 기본적으로 `viewer`에 허용한다.
- destructive 또는 secret 접근은 `admin`에만 허용한다.

### 2.5 CI/자동화 주체(결정)

- MVP에서는 "사람이 아닌 Hub Operator 계정"(Service Account)을 별도로 모델링하지 않는다.
- CI/CD 자동화는 Operator RBAC이 아니라 **Project API key**(Data Plane) 또는 "CI에서의 `stk` 실행"(Operator token)으로 처리한다.

---

## 3) 멤버 관리 플로우

### 3.1 초대

```
stk org invite <email> --role <member|admin>
stk team invite <email> --team <team> --role <member|lead>
stk project invite <email> --role <admin|deployer|viewer>
```

- 초대 시 이메일로 링크 발송 (또는 CLI에서 수락 코드 입력).
- 초대 만료: 7일 (설정 가능).
- 이미 Org 멤버인 경우, Team/Project에 즉시 추가.

초대 상태 모델(초안):
- `pending` (기본)
- `accepted`
- `expired`
- `cancelled`

수락(예시):
- 이메일 링크로 수락(웹 UI가 없으면, 링크는 1회성 코드만 제공)
- CLI로 수락: `stk invite accept <code>`

실패 케이스(예시):

| 상황 | 기대 결과 |
|------|----------|
| 초대 생성 권한 없음 | `403 FORBIDDEN` |
| 동일 scope에 이미 `pending` 초대가 있음 | `409 CONFLICT` |
| 만료된 초대 코드를 수락 | `400 BAD_REQUEST` |
| 존재하지 않는 초대 코드 | `404 NOT_FOUND` |

### 3.2 역할 변경

```
stk org members set-role <user> --role <role>
stk team members set-role <user> --team <team> --role <role>
stk project members set-role <user> --role <role>
```

### 3.3 제거

```
stk org remove <user>
stk team remove <user> --team <team>
stk project remove <user>
```

- Org에서 제거하면 모든 하위 Team/Project 접근도 해제된다.

### 3.4 조회

```
stk org members [--role <role>]
stk team members --team <team>
stk project members
```

---

## 4) CLI 인가 흐름

1. `stk` 명령 실행 시, 로컬 저장된 access token을 Hub에 전송한다.
2. Hub는 토큰에서 operator identity를 추출한다.
3. Hub는 해당 operator의 org/team/project 역할을 조회한다.
4. 요청된 작업에 필요한 최소 역할과 비교해 허용/거부한다.
5. 결과를 audit log에 기록한다.
   - 상세: `plan/spec/audit-log.md` (`rbac.*` action)

---

## 미결정

- 커스텀 역할 지원 여부 및 시점 (Encore Pro처럼 유료 기능으로?)
- Org owner 이전 절차
- 2FA/MFA 적용 범위
