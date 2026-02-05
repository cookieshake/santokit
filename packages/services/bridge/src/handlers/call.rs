//! /call 핸들러
//!
//! Santokit의 핵심 엔드포인트입니다.
//! path에 따라 Auto CRUD, Custom Logic, Storage로 라우팅합니다.

use std::sync::Arc;

use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use stk_core::auth::TokenKind;
use stk_sql::CrudParams;

use crate::error::{BridgeError, Result};
use crate::state::AppState;

/// /call 요청 본문
#[derive(Debug, Deserialize)]
pub struct CallRequest {
    /// 호출 경로 (예: "db/users/select", "logics/my_logic", "storage/main/upload_sign")
    pub path: String,

    /// 파라미터
    #[serde(default)]
    pub params: Value,
}

/// /call 응답 본문
#[derive(Debug, Serialize)]
pub struct CallResponse {
    /// 결과 데이터
    pub data: Value,

    /// 메타데이터 (페이지네이션 등)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<CallMeta>,
}

#[derive(Debug, Serialize)]
pub struct CallMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u64>,
}

/// /call 핸들러
pub async fn handle_call(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CallRequest>,
) -> Result<Json<CallResponse>> {
    // 1. 컨텍스트 추출 (project/env)
    let context = extract_context(&headers)?;

    // 2. 인증 처리
    let principal = authenticate(&state, &headers, &context).await?;

    // 3. 릴리즈 로드
    let release = state
        .get_release(&context.project, &context.env)
        .await
        .ok_or_else(|| BridgeError::NotFound {
            message: format!("No release found for {}/{}", context.project, context.env),
        })?;

    // 4. 경로 파싱 및 라우팅
    let route = parse_path(&request.path)?;

    match route {
        Route::AutoCrud { table, operation } => {
            handle_auto_crud(&state, &release, &principal, &table, &operation, request.params).await
        }
        Route::Logic { name } => {
            handle_logic(&state, &release, &principal, &name, request.params).await
        }
        Route::Storage { bucket, operation } => {
            handle_storage(&state, &release, &principal, &bucket, &operation, request.params).await
        }
    }
}

/// 요청 컨텍스트 (project/env)
#[derive(Debug)]
struct RequestContext {
    project: String,
    env: String,
}

/// 헤더에서 컨텍스트 추출
fn extract_context(headers: &HeaderMap) -> Result<RequestContext> {
    let project = headers
        .get("x-santokit-project")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| BridgeError::BadRequest {
            message: "Missing X-Santokit-Project header".to_string(),
        })?;

    let env = headers
        .get("x-santokit-env")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| BridgeError::BadRequest {
            message: "Missing X-Santokit-Env header".to_string(),
        })?;

    Ok(RequestContext { project, env })
}

/// 인증 처리
async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    context: &RequestContext,
) -> Result<Principal> {
    // Dev mode: 인증 우회
    if state.config.disable_auth {
        return Ok(Principal::Anonymous);
    }

    // 토큰 추출
    let api_key = headers
        .get("x-santokit-api-key")
        .and_then(|v| v.to_str().ok());
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token_kind = TokenKind::from_headers(api_key, auth_header).ok_or_else(|| {
        BridgeError::Unauthorized {
            message: "No valid credentials provided".to_string(),
        }
    })?;

    match token_kind {
        TokenKind::ApiKey { key_id, secret: _ } => {
            // TODO: Hub에서 API Key 검증
            Ok(Principal::ApiKey {
                key_id: key_id.0,
                roles: vec!["admin".to_string()], // TODO: 실제 roles
            })
        }
        TokenKind::AccessToken(token) => {
            // TODO: PASETO 토큰 검증
            Ok(Principal::EndUser {
                user_id: "user_placeholder".to_string(),
                roles: vec![],
            })
        }
    }
}

/// 인증된 주체
#[derive(Debug)]
enum Principal {
    Anonymous,
    ApiKey { key_id: String, roles: Vec<String> },
    EndUser { user_id: String, roles: Vec<String> },
}

/// 라우트 종류
#[derive(Debug)]
enum Route {
    AutoCrud { table: String, operation: CrudOperation },
    Logic { name: String },
    Storage { bucket: String, operation: StorageOperation },
}

#[derive(Debug)]
enum CrudOperation {
    Select,
    Insert,
    Update,
    Delete,
}

#[derive(Debug)]
enum StorageOperation {
    UploadSign,
    DownloadSign,
    Delete,
}

/// 경로 파싱
fn parse_path(path: &str) -> Result<Route> {
    let parts: Vec<&str> = path.split('/').collect();

    match parts.as_slice() {
        // db/{table}/{op}
        ["db", table, op] => {
            let operation = match *op {
                "select" => CrudOperation::Select,
                "insert" => CrudOperation::Insert,
                "update" => CrudOperation::Update,
                "delete" => CrudOperation::Delete,
                _ => {
                    return Err(BridgeError::BadRequest {
                        message: format!("Unknown CRUD operation: {}", op),
                    })
                }
            };
            Ok(Route::AutoCrud {
                table: table.to_string(),
                operation,
            })
        }

        // logics/{name} 또는 logics/{dir}/{name}
        ["logics", rest @ ..] if !rest.is_empty() => {
            let name = rest.join("/");
            Ok(Route::Logic { name })
        }

        // storage/{bucket}/{op}
        ["storage", bucket, op] => {
            let operation = match *op {
                "upload_sign" => StorageOperation::UploadSign,
                "download_sign" => StorageOperation::DownloadSign,
                "delete" => StorageOperation::Delete,
                _ => {
                    return Err(BridgeError::BadRequest {
                        message: format!("Unknown storage operation: {}", op),
                    })
                }
            };
            Ok(Route::Storage {
                bucket: bucket.to_string(),
                operation,
            })
        }

        _ => Err(BridgeError::BadRequest {
            message: format!("Invalid path: {}", path),
        }),
    }
}

/// Auto CRUD 처리
async fn handle_auto_crud(
    state: &AppState,
    release: &crate::state::CachedRelease,
    principal: &Principal,
    table: &str,
    operation: &CrudOperation,
    params: Value,
) -> Result<Json<CallResponse>> {
    use stk_core::permissions::{EvalContext, Operation, PermissionEvaluator};

    // 테이블 조회
    let table_def = release
        .schema
        .find_table(table)
        .ok_or_else(|| BridgeError::NotFound {
            message: format!("Table not found: {}", table),
        })?;

    // 권한 체크
    let evaluator = PermissionEvaluator::new(&release.permissions);
    let op = match operation {
        CrudOperation::Select => Operation::Select,
        CrudOperation::Insert => Operation::Insert,
        CrudOperation::Update => Operation::Update,
        CrudOperation::Delete => Operation::Delete,
    };

    let eval_ctx = match principal {
        Principal::Anonymous => EvalContext::new(),
        Principal::ApiKey { key_id, roles } => {
            EvalContext::new().with_auth(stk_core::permissions::context::AuthContext::new(
                key_id.clone(),
                roles.clone(),
            ))
        }
        Principal::EndUser { user_id, roles } => {
            EvalContext::new().with_auth(stk_core::permissions::context::AuthContext::new(
                user_id.clone(),
                roles.clone(),
            ))
        }
    };

    let eval_result = evaluator
        .evaluate(table, op, &eval_ctx)
        .map_err(|e| BridgeError::Core(e))?;

    if !eval_result.allowed {
        return Err(BridgeError::Forbidden {
            message: eval_result.reason.unwrap_or_else(|| "Access denied".to_string()),
        });
    }

    // 파라미터 파싱
    let crud_params: CrudParams = serde_json::from_value(params).map_err(|e| {
        BridgeError::BadRequest {
            message: format!("Invalid params: {}", e),
        }
    })?;

    // TODO: SQL 생성 및 실행
    // let schema_ir = release.schema.get_connection(&table_def.connection).unwrap();
    // let builder = stk_sql::SelectBuilder::new(schema_ir, table_def);
    // let (sql, values) = builder.build(&crud_params, eval_result.where_clause.as_deref());
    // let result = sqlx::query(&sql).fetch_all(&pool).await?;

    // 임시 응답
    Ok(Json(CallResponse {
        data: serde_json::json!({
            "message": format!("CRUD {} on {} - not yet implemented", operation_name(operation), table),
            "params": crud_params,
        }),
        meta: None,
    }))
}

fn operation_name(op: &CrudOperation) -> &'static str {
    match op {
        CrudOperation::Select => "SELECT",
        CrudOperation::Insert => "INSERT",
        CrudOperation::Update => "UPDATE",
        CrudOperation::Delete => "DELETE",
    }
}

/// Custom Logic 처리
async fn handle_logic(
    state: &AppState,
    release: &crate::state::CachedRelease,
    principal: &Principal,
    name: &str,
    params: Value,
) -> Result<Json<CallResponse>> {
    // TODO: logics/*.sql 로드 및 실행
    Ok(Json(CallResponse {
        data: serde_json::json!({
            "message": format!("Logic {} - not yet implemented", name),
        }),
        meta: None,
    }))
}

/// Storage 처리
async fn handle_storage(
    state: &AppState,
    release: &crate::state::CachedRelease,
    principal: &Principal,
    bucket: &str,
    operation: &StorageOperation,
    params: Value,
) -> Result<Json<CallResponse>> {
    // TODO: S3 Presigned URL 생성
    Ok(Json(CallResponse {
        data: serde_json::json!({
            "message": format!("Storage {} on {} - not yet implemented", storage_op_name(operation), bucket),
        }),
        meta: None,
    }))
}

fn storage_op_name(op: &StorageOperation) -> &'static str {
    match op {
        StorageOperation::UploadSign => "upload_sign",
        StorageOperation::DownloadSign => "download_sign",
        StorageOperation::Delete => "delete",
    }
}
