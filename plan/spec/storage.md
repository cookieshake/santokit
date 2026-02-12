# Storage (File Object Storage) — Spec

목표:
- 대용량 파일을 Bridge를 거치지 않고 S3 호환 스토리지에 직접 업로드/다운로드한다.
- Bridge는 **Presigned URL 발급 및 권한 제어(Signer)** 역할만 수행한다.
- Auto CRUD와 동일하게 `POST /call` 엔드포인트를 사용한다.

---

## 1) Configuration

Hub에 버킷 연결정보를 등록하고, `config/storage.yaml`로 정책을 관리한다.

```yaml
# config/storage.yaml

buckets:
  main: # bucket alias
    provider: s3
    region: ap-northeast-2
    bucket: my-app-assets-prod

policies:
  # key glob pattern
  "avatars/*":
    upload_sign: 
      roles: [authenticated]
      condition: "true" # 추가 제약 없음, 인증만 되면 OK
      maxSize: 5MB
      allowedTypes: ["image/jpeg", "image/png"]
    download_sign:
      roles: [public]
    delete:
      roles: [authenticated]
      condition: "request.auth.sub != ''"

  "docs/{userId}/*":
    upload_sign:
      roles: [authenticated]
      # Path variable 바인딩 지원
      condition: "path.userId == request.auth.sub"
    download_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
    delete:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
```

---

## 2) Runtime API (`POST /call`)

Storage 기능은 `storage/{bucket}/{op}` 컨벤션으로 라우팅된다.

### 2.1 `upload_sign` (for PUT)
클라이언트가 업로드용 Presigned URL을 요청한다.

- **Path:** `storage/{bucket}/upload_sign`
- **Params:**
  - `key`: 저장할 파일 경로 (예: `avatars/123.jpg`)
  - `contentType`: MIME 타입 (검증용)
  - `contentLength`: 파일 크기 (검증용, Optional)

**동작:**
1. `key`가 `config/storage.yaml`의 어느 정책에 매칭되는지 확인.
2. 권한 검사: (`roles` OR 조건) AND (`condition` CEL 평가).
3. 파일 제약 검사 (`maxSize`, `allowedTypes`).
4. S3 Presigned URL (`PUT` method) 생성 후 반환.

**Response:**
```json
{
  "url": "https://s3.ap-northeast-2.amazonaws.com/...?Signature=...",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" }
}
```

### 2.2 `download_sign` (for GET)
Private 파일 접근을 위한 Presigned URL을 요청한다. (Public 파일은 그냥 URL 사용)

- **Path:** `storage/{bucket}/download_sign`
- **Params:**
  - `key`: 파일 경로

**동작:**
1. 정책 매칭 및 권한 검사.
2. S3 Presigned URL (`GET` method, 짧은 만료 시간) 생성 후 반환.

### 2.3 `delete`
- **Path:** `storage/{bucket}/delete`
- **Params:**
  - `key`: 파일 경로

**권한 모델:**
- `upload_sign`/`download_sign`와 동일하게 `(roles OR) AND condition(CEL)` 패턴으로 검사한다.
- 정책에 `delete` 규칙이 없으면 기본 거부(`403`)한다.

**동작:**
1. 정책 매칭 및 `delete` 규칙 존재 여부 확인.
2. 권한 검사: (`roles` OR 조건) AND (`condition` CEL 평가).
3. 권한 통과 시 스토리지 삭제 수행.

### 2.4 Multipart Upload

대용량 업로드를 위해 S3 Multipart Upload를 지원한다.

#### 2.4.1 `multipart_create`
- **Path:** `storage/{bucket}/multipart_create`
- **Params:**
  - `key`: 파일 경로
  - `contentType`: MIME 타입
  - `contentLength`: 전체 크기 (Optional; 정책에 `maxSize`가 있으면 필수)
- **동작:**
  1. 정책 매칭 및 권한 검사(roles + CEL)
  2. 제약 검사(`maxSize`, `allowedTypes`)
  3. Multipart Upload를 생성하고 `uploadId`를 반환
- **Response:**
  - `uploadId`: string

#### 2.4.2 `multipart_sign_part`
- **Path:** `storage/{bucket}/multipart_sign_part`
- **Params:**
  - `key`: 파일 경로
  - `uploadId`: multipart upload id
  - `partNumber`: 1-based part number
  - `contentLength`: part 크기 (Optional)
- **동작:**
  1. 정책 매칭 및 권한 검사(roles + CEL)
  2. 해당 part 업로드용 presigned URL(PUT)을 발급

#### 2.4.3 `multipart_complete`
- **Path:** `storage/{bucket}/multipart_complete`
- **Params:**
  - `key`: 파일 경로
  - `uploadId`: multipart upload id
  - `parts`: `{ partNumber: number, etag: string }[]`
- **동작:**
  1. 정책 매칭 및 권한 검사(roles + CEL)
  2. S3 multipart complete 호출

#### 2.4.4 `multipart_abort`
- **Path:** `storage/{bucket}/multipart_abort`
- **Params:**
  - `key`: 파일 경로
  - `uploadId`: multipart upload id
- **동작:**
  1. 정책 매칭 및 권한 검사(roles + CEL)
  2. S3 multipart abort 호출

---

## 3) Permissions

규칙:
- **Roles (OR):** 나열된 역할 중 하나라도 있으면 통과.
- **Condition (CEL):** `roles` 통과 후, 2차적으로 CEL 표현식이 `true`여야 최종 허용.
- `public`은 완전 익명 허용이 아니라, Bridge 공통 인증 게이트웨이를 통과한 요청에서 추가 role 제한이 없다는 의미다.

CEL Context 변수:
- `request.auth.sub`: 사용자 ID
- `request.auth.roles`: 사용자 Role List
- `path.{variable}`: 정책 키 패턴의 와일드카드나 변수 매칭 (예: `docs/{userId}/*` → `path.userId`)
- `request.params.key`: 전체 파일 경로
- `request.params.contentLength`: 파일 크기 (upload 시)

---

## 3.1) Security Rules

Presigned URL 보안 기본값:
- URL 만료 시간은 짧게 유지한다.
  - `upload_sign`: 기본 5분(최대 15분)
  - `download_sign`: 기본 1분(최대 5분)
- URL은 1회성 보장을 강제하지 않는다. 대신 짧은 TTL과 권한 조건으로 리스크를 줄인다.

Key 정규화/검증:
- `key`는 canonical path로 정규화한다.
- `..`, 이중 slash(`//`), 제어문자, 선행 slash(`/`)가 포함된 key는 거부한다(`400 BAD_REQUEST`).
- 정책 매칭은 정규화된 key를 기준으로 수행한다.

업로드 크기/타입 검증:
- 정책에 `maxSize`가 있으면 `contentLength`는 필수다.
- `contentLength`가 `maxSize`를 넘으면 서명 발급을 거부한다(`400 BAD_REQUEST`).
- `allowedTypes`가 있으면 `contentType`은 필수이며 목록 불일치 시 거부한다.

---

## 4) Client-side Flow

1. **Upload:**
   - Client → Bridge: `upload_sign` 요청 → Signed URL 획득
   - Client → S3: `PUT <signed_url>` (Body: File Blob)
   - (Optional) Client → Bridge: "업로드 완료"를 알리는 별도 Auto CRUD(`db/files/insert`) 호출 (파일 메타데이터 DB 저장 시)

2. **Download (Private):**
   - Client → Bridge: `download_sign` 요청 → Signed URL 획득
   - Client: `<img src={signedUrl} />`

---

## 5) Limitation

- Bridge는 파일 스트림을 직접 처리하지 않는다 (Proxy 모드 미지원).

---

## 6) Schema Integration

스키마(`type: file`)와 연동하여 자동 관리를 지원한다.

- `onDelete: cascade`:
  - Bridge는 해당 컬럼을 가진 Row가 `DELETE` 될 때, `params`로 전달된 ID 등을 이용해 삭제 전 데이터를 조회한다.
  - 조회된 파일 경로를 이용해 S3 `DeleteObject`를 비동기(Background)로 요청한다.
  - **Best Effort 정책**: 실패 시 에러 로그를 남기지만, 트랜잭션을 롤백하지는 않는다.
  - **주의**: 네트워크 장애나 S3 오류로 인해 orphan 파일이 남을 수 있음
  - 정기적인 orphan 파일 정리 작업(S3 lifecycle policy 등) 권장
  - 안전 규칙(권장, v0):
    - `type: file` 컬럼에 들어가는 key는 해당 버킷 정책 중 하나에 매칭되는 형식이어야 한다(정규화/검증 포함).
    - cascade 삭제는 `storage/{bucket}/delete`와 동일한 권한 모델(roles + CEL)을 적용해야 한다.
      - 즉, 삭제 권한이 없는 요청 컨텍스트에서는 파일 삭제가 실행되지 않아야 한다(best effort).
- `onDelete: preserve`:
  - 아무 동작도 하지 않는다. (기본값)
