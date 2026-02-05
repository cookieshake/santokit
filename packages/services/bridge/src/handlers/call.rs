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

use stk_core::auth::{ApiKey, TokenKind, TokenValidator};
use stk_core::id::IdGenerator;
use stk_sql::CrudParams;
use sqlx::{Column, Row, TypeInfo};

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
    // 1. 컨텍스트 힌트 추출 (project/env)
    let context_hint = extract_context(&headers)?;

    // 2. 인증 처리 (컨텍스트 확정 포함)
    let auth = authenticate(&state, &headers, context_hint).await?;
    let context = auth.context;
    let principal = auth.principal;

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

/// 인증 결과
struct AuthOutcome {
    principal: Principal,
    context: RequestContext,
}

/// 헤더에서 컨텍스트 힌트 추출
fn extract_context(headers: &HeaderMap) -> Result<Option<RequestContext>> {
    let project = headers
        .get("x-santokit-project")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let env = headers
        .get("x-santokit-env")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    match (project, env) {
        (Some(project), Some(env)) => Ok(Some(RequestContext { project, env })),
        (None, None) => Ok(None),
        _ => Err(BridgeError::BadRequest {
            message: "Both X-Santokit-Project and X-Santokit-Env must be provided together".to_string(),
        }),
    }
}

/// 인증 처리
async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    context_hint: Option<RequestContext>,
) -> Result<AuthOutcome> {
    // Dev mode: 인증 우회
    if state.config.disable_auth {
        let hint = context_hint.ok_or_else(|| BridgeError::BadRequest {
            message: "Missing project/env context".to_string(),
        })?;
        return Ok(AuthOutcome {
            principal: Principal::Anonymous,
            context: hint,
        });
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
        TokenKind::ApiKey { key_id, secret } => {
            let key = verify_api_key(state, &key_id.0, &secret).await?;

            if let Some(hint) = &context_hint {
                if !key.matches_context(&hint.project, &hint.env) {
                    return Err(BridgeError::Forbidden {
                        message: "API key context mismatch".to_string(),
                    });
                }
            }

            let context = RequestContext {
                project: key.project_id.clone(),
                env: key.env_id.clone(),
            };

            Ok(AuthOutcome {
                principal: Principal::ApiKey {
                    key_id: key.id.0.clone(),
                    roles: key.roles.clone(),
                },
                context,
            })
        }
        TokenKind::AccessToken(token) => {
            let validator = TokenValidator::new(vec![]);
            let claims = validator
                .validate_access_token(&token)
                .map_err(BridgeError::Core)?;

            let context = if let Some(hint) = &context_hint {
                if !claims.matches_context(&hint.project, &hint.env) {
                    return Err(BridgeError::Forbidden {
                        message: "Access token context mismatch".to_string(),
                    });
                }
                RequestContext {
                    project: hint.project.clone(),
                    env: hint.env.clone(),
                }
            } else {
                RequestContext {
                    project: claims.project_id.clone(),
                    env: claims.env_id.clone(),
                }
            };

            TokenValidator::verify_context(&claims, &context.project, &context.env)
                .map_err(BridgeError::Core)?;

            Ok(AuthOutcome {
                principal: Principal::EndUser {
                    user_id: claims.sub.clone(),
                    roles: claims.roles.clone(),
                },
                context,
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
            EvalContext::new().with_auth(stk_core::permissions::AuthContext::new(
                key_id.clone(),
                roles.clone(),
            ))
        }
        Principal::EndUser { user_id, roles } => {
            EvalContext::new().with_auth(stk_core::permissions::AuthContext::new(
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

    if release
        .schema
        .get_connection(&table_def.connection)
        .is_none()
    {
        return Err(BridgeError::Internal {
            message: "Schema IR not found for connection".to_string(),
        });
    }

    let conn = release
        .connections
        .get(&table_def.connection)
        .ok_or_else(|| BridgeError::Internal {
            message: format!("Connection not found: {}", table_def.connection),
        })?;

    let pool = state
        .get_pool(conn)
        .await
        .map_err(|e| BridgeError::Internal {
            message: format!("Failed to connect DB: {}", e),
        })?;

    let response = match operation {
        CrudOperation::Select => {
            let builder = stk_sql::SelectBuilder::new(table_def);
            let (sql, values) = builder.build(&crud_params, eval_result.where_clause.as_deref());
            let rows = sqlx::query(&sql)
                .fetch_all(&pool)
                .await
                .map_err(BridgeError::Database)?;
            let data = rows_to_json(rows);
            serde_json::json!({ "data": data, "values": values })
        }
        CrudOperation::Insert => {
            let data = crud_params.data.ok_or_else(|| BridgeError::BadRequest {
                message: "Missing data for insert".to_string(),
            })?;

            let generated_id = if table_def.id.generate.bridge_generates() {
                if data.contains_key(&table_def.id.name) {
                    return Err(BridgeError::BadRequest {
                        message: "ID should not be provided for server-generated IDs".to_string(),
                    });
                }
                Some(IdGenerator::generate(table_def.id.generate).map_err(BridgeError::Core)?)
            } else if table_def.id.generate.client_provides() {
                if !data.contains_key(&table_def.id.name) {
                    return Err(BridgeError::BadRequest {
                        message: "ID must be provided for client-generated IDs".to_string(),
                    });
                }
                None
            } else {
                None
            };

            let builder = stk_sql::InsertBuilder::new(table_def);
            let sql = builder.build(&data, generated_id.as_deref());
            let rows = sqlx::query(&sql)
                .fetch_all(&pool)
                .await
                .map_err(BridgeError::Database)?;
            let ids = rows
                .iter()
                .filter_map(|row| row.try_get::<String, _>(0).ok())
                .collect::<Vec<_>>();
            serde_json::json!({ "ids": ids, "generated_id": generated_id })
        }
        CrudOperation::Update => {
            let data = crud_params.data.ok_or_else(|| BridgeError::BadRequest {
                message: "Missing data for update".to_string(),
            })?;
            let where_clause = crud_params.r#where.ok_or_else(|| BridgeError::BadRequest {
                message: "Update requires where clause".to_string(),
            })?;
            if where_clause.is_empty() {
                return Err(BridgeError::BadRequest {
                    message: "Update requires non-empty where clause".to_string(),
                });
            }
            let builder = stk_sql::UpdateBuilder::new(table_def);
            let sql = builder.build(&data, &where_clause, eval_result.where_clause.as_deref());
            let rows = sqlx::query(&sql)
                .fetch_all(&pool)
                .await
                .map_err(BridgeError::Database)?;
            let ids = rows
                .iter()
                .filter_map(|row| row.try_get::<String, _>(0).ok())
                .collect::<Vec<_>>();
            serde_json::json!({ "ids": ids })
        }
        CrudOperation::Delete => {
            let where_clause = crud_params.r#where.ok_or_else(|| BridgeError::BadRequest {
                message: "Delete requires where clause".to_string(),
            })?;
            if where_clause.is_empty() {
                return Err(BridgeError::BadRequest {
                    message: "Delete requires non-empty where clause".to_string(),
                });
            }
            let builder = stk_sql::DeleteBuilder::new(table_def);
            let sql = builder.build(&where_clause, eval_result.where_clause.as_deref());
            let rows = sqlx::query(&sql)
                .fetch_all(&pool)
                .await
                .map_err(BridgeError::Database)?;
            let ids = rows
                .iter()
                .filter_map(|row| row.try_get::<String, _>(0).ok())
                .collect::<Vec<_>>();
            serde_json::json!({ "ids": ids })
        }
    };

    Ok(Json(CallResponse { data: response, meta: None }))
}

/// Custom Logic 처리
async fn handle_logic(
    _state: &AppState,
    _release: &crate::state::CachedRelease,
    _principal: &Principal,
    name: &str,
    params: Value,
) -> Result<Json<CallResponse>> {
    // 현재는 입력을 그대로 반환하는 dev용 동작만 지원
    Ok(Json(CallResponse {
        data: serde_json::json!({
            "logic": name,
            "params": params,
        }),
        meta: None,
    }))
}

/// Storage 처리
async fn handle_storage(
    _state: &AppState,
    release: &crate::state::CachedRelease,
    principal: &Principal,
    bucket: &str,
    operation: &StorageOperation,
    params: Value,
) -> Result<Json<CallResponse>> {
    let storage = &release.storage;
    let bucket_cfg = storage
        .buckets
        .get(bucket)
        .ok_or_else(|| BridgeError::NotFound {
            message: format!("Bucket not found: {}", bucket),
        })?;

    let key = params
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| BridgeError::BadRequest {
            message: "Missing key".to_string(),
        })?;

    let (policy, path_vars) = match_policy(storage, key).ok_or_else(|| BridgeError::Forbidden {
        message: "No matching storage policy".to_string(),
    })?;

    let rule = match operation {
        StorageOperation::UploadSign => policy.upload_sign.as_ref(),
        StorageOperation::DownloadSign => policy.download_sign.as_ref(),
        StorageOperation::Delete => policy.delete.as_ref(),
    }
    .ok_or_else(|| BridgeError::Forbidden {
        message: "Operation not allowed by policy".to_string(),
    })?;

    if !check_storage_roles(rule.roles.as_slice(), principal) {
        return Err(BridgeError::Forbidden {
            message: "Insufficient roles".to_string(),
        });
    }

    if let Some(condition) = &rule.condition {
        if !eval_storage_condition(condition, principal, key, &params, &path_vars)? {
            return Err(BridgeError::Forbidden {
                message: "Condition failed".to_string(),
            });
        }
    }

    if let Some(max) = rule.max_size_bytes() {
        if let Some(len) = params.get("contentLength").and_then(|v| v.as_u64()) {
            if len > max {
                return Err(BridgeError::BadRequest {
                    message: "Content length exceeds max size".to_string(),
                });
            }
        }
    }

    if let Some(types) = &rule.allowed_types {
        if let Some(content_type) = params.get("contentType").and_then(|v| v.as_str()) {
            if !types.iter().any(|t| t == content_type) {
                return Err(BridgeError::BadRequest {
                    message: "Content type not allowed".to_string(),
                });
            }
        }
    }

    let presigned = presign_s3(bucket_cfg, operation, key).await?;

    Ok(Json(CallResponse {
        data: presigned,
        meta: None,
    }))
}

async fn verify_api_key(state: &AppState, key_id: &str, secret: &str) -> Result<ApiKey> {
    #[derive(serde::Serialize)]
    struct VerifyRequest<'a> {
        key_id: &'a str,
        secret: &'a str,
    }

    #[derive(serde::Deserialize)]
    struct VerifyResponse {
        valid: bool,
        key: Option<ApiKey>,
    }

    let url = format!("{}/internal/apikeys/verify", state.config.hub_url);
    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .json(&VerifyRequest { key_id, secret })
        .send()
        .await
        .map_err(|e| BridgeError::Internal {
            message: format!("Failed to verify api key: {}", e),
        })?;

    if !response.status().is_success() {
        return Err(BridgeError::Unauthorized {
            message: "API key verification failed".to_string(),
        });
    }

    let body: VerifyResponse = response.json().await.map_err(|e| BridgeError::Internal {
        message: format!("Invalid API key verification response: {}", e),
    })?;

    if !body.valid {
        return Err(BridgeError::Unauthorized {
            message: "Invalid API key".to_string(),
        });
    }

    body.key.ok_or_else(|| BridgeError::Unauthorized {
        message: "Invalid API key".to_string(),
    })
}

fn rows_to_json(rows: Vec<sqlx::postgres::PgRow>) -> Vec<Value> {
    rows.into_iter().map(row_to_json).collect()
}

fn row_to_json(row: sqlx::postgres::PgRow) -> Value {
    let mut obj = serde_json::Map::new();
    for column in row.columns() {
        let name = column.name();
        let type_name = column.type_info().name().to_ascii_uppercase();
        let value = match type_name.as_str() {
            "INT2" | "INT4" | "INT8" | "INTEGER" | "BIGINT" => row
                .try_get::<Option<i64>, _>(name)
                .ok()
                .flatten()
                .map(|v| Value::Number(v.into())),
            "FLOAT4" | "FLOAT8" | "DOUBLE PRECISION" => row
                .try_get::<Option<f64>, _>(name)
                .ok()
                .flatten()
                .and_then(|v| serde_json::Number::from_f64(v))
                .map(Value::Number),
            "BOOL" | "BOOLEAN" => row
                .try_get::<Option<bool>, _>(name)
                .ok()
                .flatten()
                .map(Value::Bool),
            "JSON" | "JSONB" => row
                .try_get::<Option<serde_json::Value>, _>(name)
                .ok()
                .flatten(),
            "UUID" => row
                .try_get::<Option<uuid::Uuid>, _>(name)
                .ok()
                .flatten()
                .map(|v| Value::String(v.to_string())),
            "TIMESTAMPTZ" | "TIMESTAMP" => row
                .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(name)
                .ok()
                .flatten()
                .map(|v| Value::String(v.to_rfc3339())),
            _ => row
                .try_get::<Option<String>, _>(name)
                .ok()
                .flatten()
                .map(Value::String),
        }
        .unwrap_or(Value::Null);

        obj.insert(name.to_string(), value);
    }
    Value::Object(obj)
}

fn check_storage_roles(required: &[stk_core::permissions::RoleRequirement], principal: &Principal) -> bool {
    if required.is_empty() {
        return true;
    }

    let is_authenticated = !matches!(principal, Principal::Anonymous);
    let roles = match principal {
        Principal::ApiKey { roles, .. } => roles,
        Principal::EndUser { roles, .. } => roles,
        Principal::Anonymous => &vec![],
    };

    for req in required {
        match req {
            stk_core::permissions::RoleRequirement::Public => return true,
            stk_core::permissions::RoleRequirement::Authenticated => {
                if is_authenticated {
                    return true;
                }
            }
            stk_core::permissions::RoleRequirement::Role(role) => {
                if roles.iter().any(|r| r == role) {
                    return true;
                }
            }
        }
    }

    false
}

fn match_policy<'a>(
    storage: &'a stk_core::storage::StorageConfig,
    key: &'a str,
) -> Option<(&'a stk_core::storage::StoragePolicy, std::collections::HashMap<String, String>)> {
    let mut best: Option<(&stk_core::storage::StoragePolicy, std::collections::HashMap<String, String>, usize)> = None;
    for (pattern, policy) in &storage.policies {
        if let Some(vars) = match_pattern(pattern, key) {
            let score = pattern.len();
            if best.as_ref().map(|b| score > b.2).unwrap_or(true) {
                best = Some((policy, vars, score));
            }
        }
    }
    best.map(|(p, v, _)| (p, v))
}

fn match_pattern(pattern: &str, key: &str) -> Option<std::collections::HashMap<String, String>> {
    let mut vars = std::collections::HashMap::new();
    let p_parts: Vec<&str> = pattern.split('/').collect();
    let k_parts: Vec<&str> = key.split('/').collect();

    let mut i = 0;
    let mut j = 0;
    while i < p_parts.len() && j < k_parts.len() {
        let p = p_parts[i];
        let k = k_parts[j];

        if p == "*" {
            if i == p_parts.len() - 1 {
                return Some(vars);
            }
            i += 1;
            j += 1;
            continue;
        }

        if let Some(var) = p.strip_prefix('{').and_then(|v| v.strip_suffix('}')) {
            vars.insert(var.to_string(), k.to_string());
            i += 1;
            j += 1;
            continue;
        }

        if let Some(prefix) = p.strip_suffix('*') {
            if k.starts_with(prefix) {
                i += 1;
                j += 1;
                continue;
            } else {
                return None;
            }
        }

        if p != k {
            return None;
        }

        i += 1;
        j += 1;
    }

    if i == p_parts.len() && j == k_parts.len() {
        Some(vars)
    } else if i == p_parts.len() - 1 && p_parts[i] == "*" {
        Some(vars)
    } else {
        None
    }
}

fn eval_storage_condition(
    condition: &str,
    principal: &Principal,
    key: &str,
    params: &Value,
    path_vars: &std::collections::HashMap<String, String>,
) -> Result<bool> {
    use cel_interpreter::{Context, Program};
    use cel_interpreter::objects::Value as CelValue;

    let mut ctx = Context::default();

    let sub = match principal {
        Principal::EndUser { user_id, .. } => user_id.clone(),
        Principal::ApiKey { key_id, .. } => key_id.clone(),
        Principal::Anonymous => "".to_string(),
    };
    let roles = match principal {
        Principal::EndUser { roles, .. } => roles.clone(),
        Principal::ApiKey { roles, .. } => roles.clone(),
        Principal::Anonymous => Vec::new(),
    };
    let auth_obj = serde_json::json!({
        "sub": sub,
        "roles": roles
    });

    let request_obj = serde_json::json!({
        "auth": auth_obj,
        "params": params,
        "key": key
    });

    ctx.add_variable_from_value("request", json_to_cel(request_obj));
    ctx.add_variable_from_value("path", json_to_cel(serde_json::json!(path_vars)));

    let program = Program::compile(condition).map_err(|e| BridgeError::BadRequest {
        message: e.to_string(),
    })?;
    let result = program.execute(&ctx).map_err(|e| BridgeError::BadRequest {
        message: e.to_string(),
    })?;

    match result {
        CelValue::Bool(b) => Ok(b),
        _ => Err(BridgeError::BadRequest {
            message: "Condition did not evaluate to bool".to_string(),
        }),
    }
}

fn json_to_cel(value: Value) -> cel_interpreter::objects::Value {
    match value {
        Value::Null => cel_interpreter::objects::Value::Null,
        Value::Bool(b) => cel_interpreter::objects::Value::Bool(b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                cel_interpreter::objects::Value::Int(i)
            } else if let Some(u) = n.as_u64() {
                cel_interpreter::objects::Value::UInt(u)
            } else if let Some(f) = n.as_f64() {
                cel_interpreter::objects::Value::Float(f)
            } else {
                cel_interpreter::objects::Value::Null
            }
        }
        Value::String(s) => cel_interpreter::objects::Value::String(s.into()),
        Value::Array(arr) => {
            let values = arr.into_iter().map(json_to_cel).collect::<Vec<_>>();
            cel_interpreter::objects::Value::List(std::sync::Arc::new(values))
        }
        Value::Object(map) => {
            let mut obj = std::collections::HashMap::new();
            for (k, v) in map {
                obj.insert(cel_interpreter::objects::Key::from(k), json_to_cel(v));
            }
            cel_interpreter::objects::Value::Map(cel_interpreter::objects::Map {
                map: std::sync::Arc::new(obj),
            })
        }
    }
}

async fn presign_s3(
    bucket_cfg: &stk_core::storage::BucketConfig,
    operation: &StorageOperation,
    key: &str,
) -> Result<Value> {
    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let client = aws_sdk_s3::Client::new(&config);
    let bucket = &bucket_cfg.bucket;

    let expires = std::time::Duration::from_secs(900);

    let (method, url, headers) = match operation {
        StorageOperation::UploadSign => {
            let presigned = client
                .put_object()
                .bucket(bucket)
                .key(key)
                .presigned(
                    aws_sdk_s3::presigning::PresigningConfig::expires_in(expires)
                        .map_err(|e| BridgeError::Internal { message: e.to_string() })?,
                )
                .await
                .map_err(|e| BridgeError::Internal { message: e.to_string() })?;
            let headers = presigned
                .headers()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect::<Vec<_>>();
            ("PUT", presigned.uri().to_string(), headers)
        }
        StorageOperation::DownloadSign => {
            let presigned = client
                .get_object()
                .bucket(bucket)
                .key(key)
                .presigned(
                    aws_sdk_s3::presigning::PresigningConfig::expires_in(expires)
                        .map_err(|e| BridgeError::Internal { message: e.to_string() })?,
                )
                .await
                .map_err(|e| BridgeError::Internal { message: e.to_string() })?;
            let headers = presigned
                .headers()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect::<Vec<_>>();
            ("GET", presigned.uri().to_string(), headers)
        }
        StorageOperation::Delete => {
            let presigned = client
                .delete_object()
                .bucket(bucket)
                .key(key)
                .presigned(
                    aws_sdk_s3::presigning::PresigningConfig::expires_in(expires)
                        .map_err(|e| BridgeError::Internal { message: e.to_string() })?,
                )
                .await
                .map_err(|e| BridgeError::Internal { message: e.to_string() })?;
            let headers = presigned
                .headers()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect::<Vec<_>>();
            ("DELETE", presigned.uri().to_string(), headers)
        }
    };

    let mut header_map = serde_json::Map::new();
    for (k, v) in headers {
        header_map.insert(k, Value::String(v));
    }

    Ok(serde_json::json!({
        "url": url,
        "method": method,
        "headers": header_map
    }))
}
