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

  "docs/{userId}/*":
    upload_sign:
      roles: [authenticated]
      # Path variable 바인딩 지원
      condition: "path.userId == request.auth.sub"
    download_sign:
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

---

## 3) Permissions

규칙:
- **Roles (OR):** 나열된 역할 중 하나라도 있으면 통과.
- **Condition (CEL):** `roles` 통과 후, 2차적으로 CEL 표현식이 `true`여야 최종 허용.

CEL Context 변수:
- `request.auth.sub`: 사용자 ID
- `request.auth.roles`: 사용자 Role List
- `path.{variable}`: 정책 키 패턴의 와일드카드나 변수 매칭 (예: `docs/{userId}/*` → `path.userId`)
- `request.params.key`: 전체 파일 경로
- `request.params.contentLength`: 파일 크기 (upload 시)

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
- Bridge는 파일 스트림을 직접 처리하지 않는다 (Proxy 모드 미지원).
- Multipart Upload(대용량 분할 업로드)를 위한 복잡한 Sign Flow는 v1에서 제외한다.

---

## 6) Schema Integration

스키마(`type: file`)와 연동하여 자동 관리를 지원한다.

- `onDelete: cascade`:
  - Bridge는 해당 컬럼을 가진 Row가 `DELETE` 될 때, `params`로 전달된 ID 등을 이용해 삭제 전 데이터를 조회한다.
  - 조회된 파일 경로를 이용해 S3 `DeleteObject`를 비동기(Background)로 요청한다.
  - 실패 시 에러 로그를 남기지만, 트랜잭션을 롤백하지는 않는다(Best Effort).
- `onDelete: preserve`:
  - 아무 동작도 하지 않는다. (기본값)
