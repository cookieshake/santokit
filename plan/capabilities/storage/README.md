# Storage Capability Guide

이 도메인은 Bridge의 파일 오브젝트 스토리지 계층이 제공하는 presigned URL 발급, 권한 제어, 멀티파트 업로드, 스키마 연동 전체를 다룬다.
모든 capability는 `POST /call` 엔드포인트를 통해 Bridge에 도달하며, `storage/{bucket}/{op}` 컨벤션으로 라우팅된다.
Bridge는 파일 스트림을 직접 처리하지 않는다. 오직 **Signer** 역할만 수행한다.

## Bridge의 역할: Signer Only

Bridge는 파일 전송 경로에 끼어들지 않는다. 클라이언트는 다음 흐름으로 S3와 직접 통신한다.

**업로드:**
1. Client → Bridge: `upload_sign` 요청 → Presigned PUT URL 수령
2. Client → S3: `PUT <signed_url>` (파일 본문 직접 전송)

**다운로드 (Private):**
1. Client → Bridge: `download_sign` 요청 → Presigned GET URL 수령
2. Client: `<img src={signedUrl} />` 또는 직접 GET 요청

Bridge는 URL 발급과 권한 검사만 담당한다. S3에 대한 실제 네트워크 트래픽은 클라이언트와 S3 사이에서만 흐른다.

## 정책 매칭: Key Glob 패턴

모든 스토리지 연산의 권한 모델은 `config/storage.yaml`의 정책 항목을 기준으로 동작한다.
정책은 key glob 패턴으로 선언되며, 요청의 `key`가 정규화된 뒤 패턴에 매칭된다.

- **Roles (OR):** 나열된 역할 중 하나라도 있으면 통과.
- **Condition (CEL):** `roles` 통과 후, CEL 표현식이 `true`여야 최종 허용.
- **기본 거부:** 매칭되는 정책이 없거나, 해당 연산의 규칙이 없으면 `403 FORBIDDEN`.

```yaml
policies:
  "avatars/*":
    upload_sign:
      roles: [authenticated]
      condition: "true"
      maxSize: 5MB
      allowedTypes: ["image/jpeg", "image/png"]
    download_sign:
      roles: [public]

  "docs/{userId}/*":
    upload_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub"
    download_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
    delete:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
```

## 흐름 및 의존 관계

### 1단계 — 기본 업로드/다운로드 서명: `STORAGE-001`, `STORAGE-002`

단일 파일 업로드와 다운로드를 위한 Presigned URL 발급 계약을 확립한다.
`STORAGE-001`이 key 검증, 정책 매칭, 역할·CEL 조건 검사, 파일 크기·타입 제약 검사의 기본 파이프라인을 정의한다.
`STORAGE-002`는 같은 파이프라인을 GET 방향에 적용하며, `public` 역할 지원과 짧은 TTL(기본 1분, 최대 5분)을 추가한다.

- [`STORAGE-001`](STORAGE-001-upload-sign.md) — 업로드용 Presigned PUT URL 발급
- [`STORAGE-002`](STORAGE-002-download-sign.md) — 다운로드용 Presigned GET URL 발급

### 2단계 — 파일 삭제: `STORAGE-003`

스토리지에서 파일을 직접 삭제한다. `delete` 규칙이 없는 정책은 기본 거부하며,
`delete` 규칙을 명시적으로 선언해야만 삭제가 가능하다.
역할 + CEL 조건 모델은 업로드/다운로드와 동일하다.

- [`STORAGE-003`](STORAGE-003-delete.md) — 파일 삭제 (default deny, explicit `delete` rule required)

### 3단계 — 멀티파트 업로드: `STORAGE-004`

대용량 파일(수십~수백 MB 이상)을 여러 파트로 나눠 업로드하는 흐름을 다룬다.
`STORAGE-001`의 정책 모델을 그대로 따르며, 4개의 연산으로 구성된다.

```
multipart_create  →  (파트별) multipart_sign_part  →  multipart_complete
                                                    ↓ (오류 시)
                                               multipart_abort
```

- [`STORAGE-004`](STORAGE-004-multipart-upload.md) — 멀티파트 업로드 전체 흐름

### 4단계 — 스키마 연동: `STORAGE-005`

`schema.yaml`에 `type: file` 컬럼을 선언하고 `onDelete: cascade`를 지정하면,
CRUD delete 시 Bridge가 비동기로 S3 파일 삭제를 시도한다.
이 capability는 CRUD-002(delete 안전장치)와 STORAGE-003(파일 삭제 모델)에 동시에 의존한다.

- **Best Effort 정책**: S3 삭제 실패 시 에러 로그만 남기고 DB 트랜잭션은 롤백하지 않는다.
- **주의**: 네트워크 장애나 S3 오류로 orphan 파일이 남을 수 있다. S3 lifecycle policy 등 별도 정리 작업을 권장한다.

- [`STORAGE-005`](STORAGE-005-schema-cascade-delete.md) — 스키마 `type: file` 컬럼과 cascade 삭제 연동

### 5단계 — Path 변수 바인딩: `STORAGE-006`

`docs/{userId}/*`처럼 key 패턴에 `{variable}` 세그먼트를 포함하면, Bridge가 실제 key에서
해당 변수 값을 추출하여 CEL 컨텍스트의 `path.<variable>`로 바인딩한다.
이 메커니즘을 통해 per-user 스토리지 격리를 단일 정책 항목으로 구현할 수 있다.

- [`STORAGE-006`](STORAGE-006-path-variable-binding.md) — Path 변수 추출 및 CEL 조건 바인딩

## 컴포넌트 경계 요약

Storage 도메인의 모든 capability는 Bridge(data-plane)에서 실행된다.
Bridge는 Hub로부터 릴리즈 스냅샷(storage 정책 포함)을 로드하고,
S3 SDK를 통해 Presigned URL을 발급하거나 스토리지 오퍼레이션을 수행한다.
파일 전송 자체는 항상 클라이언트와 S3 사이에서 이루어진다.

| Capability | Bridge | S3 | Hub |
|---|---|---|---|
| STORAGE-001 | 정책 매칭·권한 검사·URL 서명 | Presigned PUT URL 수신 | 릴리즈 스냅샷(storage 정책) 제공 |
| STORAGE-002 | 정책 매칭·권한 검사·URL 서명 | Presigned GET URL 수신 | — |
| STORAGE-003 | 정책 매칭·권한 검사·DeleteObject 호출 | 파일 삭제 수행 | — |
| STORAGE-004 | 멀티파트 lifecycle 관리·URL 서명 | CreateMultipartUpload / UploadPart / CompleteMultipartUpload | — |
| STORAGE-005 | 행 삭제 전 파일 key 조회·비동기 DeleteObject | 파일 삭제 수행(best effort) | — |
| STORAGE-006 | Path 변수 추출·CEL 컨텍스트 바인딩 | — | — |
