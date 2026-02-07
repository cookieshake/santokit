# Flow 16: Column-Level Permissions (columns.select / columns.update / columns.insert)

## 목적
permissions.yaml의 columns 섹션을 통해 정책 레벨에서 컬럼 접근을 제한하는 기능을 검증한다.

## 전제조건
- 프로젝트/환경/DB 연결 완료
- 스키마에 users 테이블 (id, name, email, avatar_url, c_ssn, bio 컬럼)
- permissions.yaml에 columns 제한 설정

## 시나리오
1. columns.select 제한: ["*", "!c_*"] → c_ssn SELECT 시 403
2. columns.update 제한: ["name", "avatar_url"] → email UPDATE 시 403, name UPDATE는 성공
3. columns.insert 제한: ["name", "email", "avatar_url", "bio"] → c_ssn INSERT 시 403
4. 제한 없는 컬럼은 정상 동작
5. 와일드카드 패턴 동작 확인
