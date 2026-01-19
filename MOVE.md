# Santoki 코드 리뷰: 신랄한 비판과 개선 방향

> **TL;DR**: 이 프로젝트는 기본적인 아키텍처는 갖추었으나, **타입 안전성 부재**, **코드 중복**, **레이어 경계 혼란**, **일관성 없는 네이밍**으로 인해 유지보수성이 심각하게 저하된 상태입니다.

---

## 🔥 신랄한 비판

### 1. TypeScript를 쓰면서 `any`를 남발하는 것은 범죄

현재 코드베이스에서 `any` 타입이 **최소 30곳 이상** 사용됩니다. TypeScript를 쓰는 이유가 타입 안전성인데, 이건 그냥 JavaScript에 `.ts` 확장자만 붙인 것과 다를 바 없습니다.

```typescript
// app.ts:21-25 - 정말 이게 최선입니까?
type Variables = {
    account: any;
    user: any;
    session: any;
}

// collection.repository.ts:57-61
const result = await query.execute(targetDb)
return (result.rows[0] as any).exists === true  // any로 도배

// account.repository.ts:57-60
const result = await db
    .insertInto(tableName as any)  // 왜 any?
    .values(fullData)
```

> **🎯 개선 방향**: 모든 `any`를 제거하고 적절한 타입/제네릭으로 교체. `Variables` 타입 정의 개선, Kysely 타입 시스템 활용.

---

### 2. 같은 코드를 계속 복붙하고 있습니다

`connectionManager.getConnection()`과 `connectionManager.getAdapter()` 패턴이 **모든 repository 함수마다** 반복됩니다. DRY(Don't Repeat Yourself) 원칙을 들어본 적이 없나요?

```typescript
// collection.repository.ts - 거의 모든 함수에서 반복
const targetDb = await connectionManager.getConnection(databaseId)
if (!targetDb) throw new Error('Could not connect to data source')

const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
```

> **🎯 개선 방향**: `withDbConnection(databaseId, async (db, adapter) => { ... })` 같은 헬퍼 함수 생성. 또는 repository를 클래스로 만들어 connection을 constructor injection.

---

### 3. PASETO 토큰 처리 로직이 **세 군데**에 분산

토큰 검증 로직이:
- `app.ts:114-137` (UI 미들웨어)
- `auth.controller.ts:115-131` (`/me` 엔드포인트)
- `auth.middleware.ts` (API 미들웨어)

에 **중복 구현**되어 있습니다. 한 곳에서 버그를 수정하면 다른 곳은? 잊어버리겠죠.

```typescript
// app.ts:115-117
const key = Buffer.from(config.auth.pasetoKey, 'hex')
const payload: any = await V3.decrypt(token, key)

// auth.controller.ts:116-117
const key = Buffer.from(config.auth.pasetoKey, 'hex');
const payload: any = await V3.decrypt(token, key);
```

> **🎯 개선 방향**: `lib/token.ts`에 `verifyToken()`, `decryptToken()` 함수 생성 후 재사용.

---

### 4. Service와 Repository 레이어 경계가 모호

`collection.repository.ts`가 **184줄**인데, 실제로는 DB 어댑터 로직까지 포함합니다. Repository는 단순 데이터 접근이어야 하는데, DDL 실행까지 담당?

`physical-schema.service.ts`도 존재하는데, 이게 repository.ts와 뭐가 다른지 명확하지 않습니다.

또한 `account.service.ts`가 `collectionRepository`를 직접 import하는데, 이건 service가 다른 모듈의 repository를 직접 접근하는 것으로 **레이어 위반**입니다.

```typescript
// account.service.ts:2 - 왜 service가 다른 모듈의 repository를?
import { collectionRepository } from '@/modules/collection/collection.repository.js'
```

> **🎯 개선 방향**: 
> - Repository: 순수 CRUD + 단순 쿼리만
> - Service: 비즈니스 로직 + 다른 **Service**만 의존
> - DDL 로직은 `SchemaService` 또는 `MigrationService`로 분리

---

### 5. 변수명 일관성 Zero

같은 개념에 다른 이름들:
- `databaseId` vs `dataSourceId` (collection.repository.ts:150)
- `projectId` vs `rawId` (app.ts:68,75)
- `physicalName` vs `physical_name` (snake_case와 camelCase 혼용)
- `tableName` vs `physicalName` (같은 것인데 다른 이름)

```typescript
// collection.repository.ts - 같은 파일 내에서 혼용
getIndexes: async (dataSourceId: string, physicalName: string) => {
    // dataSourceId라고 했다가...
}

createIndex: async (dataSourceId: string, physicalName: string, ...) => {
    // 여기도 dataSourceId
}

removeField: async (databaseId: string, physicalName: string, ...) => {
    // 갑자기 databaseId
}
```

> **🎯 개선 방향**: 네이밍 컨벤션 문서화 후 전체 리팩토링. `databaseId`로 통일.

---

### 6. 에러 처리가 문자열 기반

`errors.ts`가 에러 코드를 문자열로 하드코딩합니다. 타입 안전성도 없고, 오타 나면 그냥 버그.

```typescript
// errors.ts
if (e.code === '23505') { ... }  // 매직 스트링
return new AppError('...', 409, 'UNIQUE_VIOLATION')  // 하드코딩된 에러 코드
```

> **🎯 개선 방향**:
> ```typescript
> // 이렇게 바꾸세요
> const PG_ERROR_CODES = {
>     UNIQUE_VIOLATION: '23505',
>     FOREIGN_KEY_VIOLATION: '23503',
> } as const
> 
> const APP_ERROR_CODES = {
>     UNIQUE_VIOLATION: 'UNIQUE_VIOLATION',
>     // ...
> } as const
> ```

---

### 7. Import 순서가 엉망

`app.ts`를 보세요. import가 중간에 또 나옵니다:

```typescript
// app.ts:1-19 - 처음 import들
import { Hono } from 'hono'
// ... 여러 import ...

// 그러다가 98-99줄에서 갑자기 또 import
import { V3 } from 'paseto'
import { config } from '@/config/index.js'
```

> **🎯 개선 방향**: ESLint `import/order` 규칙 적용. 모든 import는 파일 상단에.

---

### 8. 트랜잭션 지원 없음

`project.service.ts:18-38`의 `delete` 함수를 보세요. 여러 테이블을 삭제하는데 트랜잭션이 없습니다. 중간에 실패하면? **데이터 정합성 깨짐**.

```typescript
// project.service.ts - 트랜잭션 없이 순차 삭제
for (const collection of collections) {
    await collectionRepository.deletePhysicalTable(db.id, collection.physical_name as string)
}
// 여기서 실패하면 일부만 삭제된 상태
await projectRepository.delete(id)
```

> **🎯 개선 방향**: Kysely의 트랜잭션 래퍼 활용. `db.transaction().execute(async (trx) => { ... })`

---

### 9. Config에 민감한 기본값

```typescript
// config/index.ts:7-11
auth: {
    pasetoKey: process.env.PASETO_KEY || '707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f',
    initialAdmin: {
        email: process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.INITIAL_ADMIN_PASSWORD || 'password123',  // 🚨
```

개발 환경이라도 `password123`은 좀...

> **🎯 개선 방향**: 프로덕션에서는 환경 변수 필수 체크. 개발용 기본값도 랜덤 생성.

---

### 10. UI Controller에서 동적 import 남용

```typescript
// ui.controller.tsx:91
const { policyService } = await import('@/modules/policy/policy.service.js')
```

왜 여기서만 동적 import? 다른 서비스는 정적 import인데.

> **🎯 개선 방향**: 일관되게 정적 import 사용. 동적 import가 필요한 이유가 있다면 주석으로 설명.

---

### 11. 테스트 파일 네이밍 불일치

```
account.admin.e2e-spec.ts
account.admin.spec.ts
account.auth.e2e-spec.ts
account.e2e.spec.ts      ← e2e.spec (점 두 개)
account.spec.ts
collection.spec.ts
collection_e2e.spec.ts   ← 언더스코어?!
```

`e2e-spec` vs `e2e.spec` vs `_e2e.spec` 뭐가 맞는 건가요?

> **🎯 개선 방향**: `*.spec.ts` (유닛), `*.e2e-spec.ts` (E2E)로 통일.

---

### 12. `account` 모듈 파일 폭발

```
account/
├── account.admin.e2e-spec.ts
├── account.admin.spec.ts
├── account.auth.e2e-spec.ts
├── account.controller.ts
├── account.e2e.spec.ts
├── account.repository.ts
├── account.service.ts
└── account.spec.ts   ← 8개 파일
```

테스트 파일 4개가 같은 폴더에. 테스트는 `__tests__` 또는 별도 폴더로 분리하세요.

> **🎯 개선 방향**: 
> ```
> account/
> ├── account.controller.ts
> ├── account.repository.ts
> ├── account.service.ts
> └── __tests__/
>     ├── account.spec.ts
>     └── account.e2e-spec.ts
> ```

---

## 📊 심각도별 정리

| 심각도 | 이슈 | 영향 |
|--------|------|------|
| 🔴 Critical | any 남발 | 런타임 버그, 타입 안전성 붕괴 |
| 🔴 Critical | 트랜잭션 없음 | 데이터 정합성 위험 |
| 🟠 High | 코드 중복 | 유지보수 비용 증가 |
| 🟠 High | 레이어 경계 혼란 | 의존성 꼬임, 테스트 어려움 |
| 🟠 High | 토큰 로직 분산 | 보안 버그 위험 |
| 🟡 Medium | 네이밍 불일치 | 가독성 저하 |
| 🟡 Medium | Import 순서 | 코드 스타일 혼란 |
| 🟢 Low | 테스트 파일 구조 | 프로젝트 정돈 |

---

## ✅ 개선 우선순위 로드맵

### Phase 1: 기반 정비 (1-2주)

1. **ESLint/Prettier 설정 강화**
   - `@typescript-eslint/no-explicit-any` 에러로 설정
   - `import/order` 규칙 추가
   
2. **네이밍 컨벤션 문서화**
   - `CONVENTIONS.md` 작성
   - `databaseId`, `projectId` 등 통일

3. **타입 정의 개선**
   ```typescript
   // types/context.ts
   export interface AppContext {
     user: UserPayload | null
     account: Account | null
     projectId: string | null
   }
   ```

### Phase 2: 구조 개선 (2-3주)

4. **공통 유틸리티 추출**
   - `lib/token.ts` - 토큰 처리 통합
   - `lib/db-helpers.ts` - DB 커넥션 헬퍼
   ```typescript
   export async function withConnection<T>(
     databaseId: string,
     fn: (db: Kysely<any>, adapter: DbAdapter) => Promise<T>
   ): Promise<T>
   ```

5. **Repository 정리**
   - DDL 로직을 `SchemaService`로 분리
   - Repository는 순수 CRUD만

6. **Service 의존성 정리**
   - Service → Service 의존만 허용
   - 다른 모듈의 Repository 직접 접근 금지

### Phase 3: 안전성 강화 (1-2주)

7. **트랜잭션 래퍼 도입**
   ```typescript
   export async function transaction<T>(
     fn: (trx: Transaction<Database>) => Promise<T>
   ): Promise<T>
   ```

8. **에러 코드 타입화**
   ```typescript
   const ErrorCodes = {
     UNIQUE_VIOLATION: 'UNIQUE_VIOLATION',
     NOT_FOUND: 'NOT_FOUND',
   } as const
   type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
   ```

### Phase 4: 폴리싱 (1주)

9. **테스트 구조 재정리**
   - `__tests__` 폴더 분리
   - 네이밍 통일

10. **Config 보안 강화**
    - 프로덕션 환경 변수 필수 체크
    - 민감한 기본값 제거

---

## 🎯 결론

현재 Santoki 코드베이스는 **"일단 동작하게 만든"** 상태입니다. MVP로는 충분하지만, 프로덕션이나 팀 확장을 고려한다면 위에서 지적한 문제들을 **반드시** 해결해야 합니다.

특히 **`any` 타입 남발**과 **트랜잭션 부재**는 시한폭탄입니다. 당장은 문제없어 보여도, 사용자가 늘어나면 반드시 터집니다.

> "기술 부채는 이자가 복리입니다. 지금 안 갚으면 나중에 10배로 갚아야 합니다."

---

*이 문서는 Santoki 코드베이스 개선을 위한 신랄한 비판과 구체적인 개선 방향을 담고 있습니다. 질문이나 우선순위 조정이 필요하면 언제든 논의해주세요.*
