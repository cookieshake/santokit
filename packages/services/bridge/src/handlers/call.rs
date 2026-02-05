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
use serde_yaml;

use stk_core::auth::{ApiKey, TokenKind, TokenValidator};
use stk_core::id::IdGenerator;
use stk_sql::params::SelectColumns;
use stk_sql::CrudParams;
use sqlx::{query::Query, Column, Row, TypeInfo};

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
    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        });

    if !check_rate_limit(&state, client_ip.as_deref()) {
        return Err(BridgeError::TooManyRequests {
            message: "Rate limit exceeded".to_string(),
        });
    }

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
            handle_logic(&state, &release, &principal, &name, request.params, client_ip).await
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
            let validator = TokenValidator::new(state.config.paseto_keys.clone());
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

            let file_columns = table_def
                .columns
                .iter()
                .filter_map(|col| match &col.column_type {
                    stk_core::schema::ColumnType::File { bucket, on_delete } => {
                        if *on_delete == stk_core::schema::FileDeletePolicy::Cascade {
                            Some((col.name.clone(), bucket.clone()))
                        } else {
                            None
                        }
                    }
                    _ => None,
                })
                .collect::<Vec<_>>();

            let mut file_deletes: Vec<(String, String)> = Vec::new();
            if !file_columns.is_empty() {
                let mut select_params = CrudParams::default();
                select_params.r#where = Some(where_clause.clone());
                select_params.select = Some(SelectColumns::Columns(
                    file_columns.iter().map(|(name, _)| name.clone()).collect(),
                ));

                let builder = stk_sql::SelectBuilder::new(table_def);
                let (select_sql, _) = builder.build(&select_params, eval_result.where_clause.as_deref());
                let rows = sqlx::query(&select_sql)
                    .fetch_all(&pool)
                    .await
                    .map_err(BridgeError::Database)?;

                for row in rows {
                    for (col_name, bucket) in &file_columns {
                        if let Ok(Some(value)) = row.try_get::<Option<String>, _>(col_name.as_str()) {
                            if !value.is_empty() {
                                file_deletes.push((bucket.clone(), value));
                            }
                        }
                    }
                }
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

            if !file_deletes.is_empty() {
                if let Err(e) = delete_s3_objects(&release.storage, &file_deletes).await {
                    tracing::warn!("Failed to delete file objects: {}", e);
                }
            }

            serde_json::json!({ "ids": ids })
        }
    };

    Ok(Json(CallResponse { data: response, meta: None }))
}

/// Custom Logic 처리
async fn handle_logic(
    state: &AppState,
    release: &crate::state::CachedRelease,
    principal: &Principal,
    name: &str,
    params: Value,
    client_ip: Option<String>,
) -> Result<Json<CallResponse>> {
    let raw = release
        .logics
        .get(name)
        .ok_or_else(|| BridgeError::NotFound {
            message: format!("Logic not found: {}", name),
        })?;

    let logic = parse_logic(raw)?;
    enforce_logic_auth(&logic.meta, principal)?;
    let resolved_params = resolve_logic_params(&logic.meta, params)?;

    let conn_name = logic
        .meta
        .connection
        .as_deref()
        .unwrap_or("main");
    let conn = release
        .connections
        .get(conn_name)
        .ok_or_else(|| BridgeError::Internal {
            message: format!("Connection not found: {}", conn_name),
        })?;
    let pool = state
        .get_pool(conn)
        .await
        .map_err(|e| BridgeError::Internal {
            message: format!("Failed to connect DB: {}", e),
        })?;

    let (sql, values) = build_logic_query(
        &logic.sql,
        &resolved_params,
        principal,
        client_ip.as_deref(),
    )?;

    let lower = sql.trim_start().to_lowercase();
    let returns_rows = lower.starts_with("select")
        || lower.starts_with("with")
        || lower.contains("returning");

    if returns_rows {
        let rows = bind_values(sqlx::query::<sqlx::Postgres>(&sql), values)
            .fetch_all(&pool)
            .await
            .map_err(BridgeError::Database)?;
        let data = rows_to_json(rows);
        Ok(Json(CallResponse {
            data: serde_json::json!({ "data": data }),
            meta: None,
        }))
    } else {
        let result = bind_values(sqlx::query::<sqlx::Postgres>(&sql), values)
            .execute(&pool)
            .await
            .map_err(BridgeError::Database)?;
        Ok(Json(CallResponse {
            data: serde_json::json!({ "affected": result.rows_affected() }),
            meta: None,
        }))
    }
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
        let len = params
            .get("contentLength")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| BridgeError::BadRequest {
                message: "Missing contentLength".to_string(),
            })?;
        if len > max {
            return Err(BridgeError::BadRequest {
                message: "Content length exceeds max size".to_string(),
            });
        }
    }

    if let Some(types) = &rule.allowed_types {
        let content_type = params
            .get("contentType")
            .and_then(|v| v.as_str())
            .ok_or_else(|| BridgeError::BadRequest {
                message: "Missing contentType".to_string(),
            })?;
        if !types.iter().any(|t| t == content_type) {
            return Err(BridgeError::BadRequest {
                message: "Content type not allowed".to_string(),
            });
        }
    }

    let presigned = presign_s3(bucket_cfg, operation, key).await?;

    Ok(Json(CallResponse {
        data: presigned,
        meta: None,
    }))
}

#[derive(Debug, Default, Deserialize)]
struct LogicMeta {
    #[allow(dead_code)]
    description: Option<String>,
    auth: Option<String>,
    roles: Option<Vec<String>>,
    params: Option<std::collections::HashMap<String, LogicParamSpec>>,
    connection: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct LogicParamSpec {
    #[serde(rename = "type")]
    param_type: Option<String>,
    required: Option<bool>,
    default: Option<Value>,
}

struct LogicFile {
    meta: LogicMeta,
    sql: String,
}

fn parse_logic(raw: &str) -> Result<LogicFile> {
    let mut lines = raw.lines();
    let mut meta = LogicMeta::default();
    let mut sql = raw.to_string();

    if let Some(first) = lines.next() {
        if first.trim() == "---" {
            let mut meta_lines = Vec::new();
            for line in lines.by_ref() {
                if line.trim() == "---" {
                    break;
                }
                meta_lines.push(line);
            }
            let meta_yaml = meta_lines.join("\n");
            if !meta_yaml.trim().is_empty() {
                meta = serde_yaml::from_str(&meta_yaml).map_err(|e| BridgeError::BadRequest {
                    message: format!("Invalid logic frontmatter: {}", e),
                })?;
            }
            sql = lines.collect::<Vec<_>>().join("\n");
        }
    }

    if sql.trim().is_empty() {
        return Err(BridgeError::BadRequest {
            message: "Logic SQL is empty".to_string(),
        });
    }

    Ok(LogicFile { meta, sql })
}

fn enforce_logic_auth(meta: &LogicMeta, principal: &Principal) -> Result<()> {
    let auth = meta.auth.as_deref().unwrap_or("authenticated");
    if auth != "public" && matches!(principal, Principal::Anonymous) {
        return Err(BridgeError::Unauthorized {
            message: "Authentication required".to_string(),
        });
    }

    if let Some(roles) = &meta.roles {
        let allowed = roles.iter().any(|role| match principal {
            Principal::ApiKey { roles, .. } => roles.iter().any(|r| r == role),
            Principal::EndUser { roles, .. } => roles.iter().any(|r| r == role),
            Principal::Anonymous => false,
        });
        if !allowed {
            return Err(BridgeError::Forbidden {
                message: "Insufficient roles".to_string(),
            });
        }
    }
    Ok(())
}

fn resolve_logic_params(meta: &LogicMeta, params: Value) -> Result<std::collections::HashMap<String, Value>> {
    let mut map = match params {
        Value::Null => std::collections::HashMap::new(),
        Value::Object(obj) => obj.into_iter().collect(),
        _ => {
            return Err(BridgeError::BadRequest {
                message: "Logic params must be an object".to_string(),
            })
        }
    };

    if let Some(specs) = &meta.params {
        for (name, spec) in specs {
            if !map.contains_key(name) {
                if let Some(default) = &spec.default {
                    map.insert(name.clone(), default.clone());
                } else if spec.required.unwrap_or(false) {
                    return Err(BridgeError::BadRequest {
                        message: format!("Missing required param: {}", name),
                    });
                }
            }

            if let Some(val) = map.get(name) {
                if let Some(param_type) = &spec.param_type {
                    if !validate_param_type(param_type, val) {
                        return Err(BridgeError::BadRequest {
                            message: format!("Invalid type for param: {}", name),
                        });
                    }
                }
            }
        }
    }

    Ok(map)
}

fn validate_param_type(param_type: &str, value: &Value) -> bool {
    match param_type {
        "string" => value.is_string(),
        "int" => value.as_i64().is_some(),
        "float" => value.as_f64().is_some(),
        "bool" | "boolean" => value.is_boolean(),
        "json" => value.is_object() || value.is_array(),
        _ => true,
    }
}

fn build_logic_query(
    sql: &str,
    params: &std::collections::HashMap<String, Value>,
    principal: &Principal,
    client_ip: Option<&str>,
) -> Result<(String, Vec<Value>)> {
    let mut system = std::collections::HashMap::new();
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
    system.insert("auth.sub".to_string(), Value::String(sub));
    system.insert(
        "auth.roles".to_string(),
        Value::Array(roles.into_iter().map(Value::String).collect()),
    );
    if let Some(ip) = client_ip {
        system.insert("client.ip".to_string(), Value::String(ip.to_string()));
    }

    let (built, names) = extract_params(sql);
    let mut values = Vec::new();
    for name in names {
        if let Some(val) = params.get(&name) {
            values.push(val.clone());
            continue;
        }
        if let Some(val) = system.get(&name) {
            values.push(val.clone());
            continue;
        }
        return Err(BridgeError::BadRequest {
            message: format!("Missing param binding: {}", name),
        });
    }

    Ok((built, values))
}

fn extract_params(sql: &str) -> (String, Vec<String>) {
    let mut out = String::new();
    let mut params = Vec::new();
    let mut chars = sql.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == ':' {
            if let Some(':') = chars.peek().copied() {
                out.push(':');
                out.push(':');
                chars.next();
                continue;
            }
            if let Some(next) = chars.peek().copied() {
                if next.is_ascii_alphabetic() || next == '_' {
                    let mut name = String::new();
                    while let Some(c) = chars.peek().copied() {
                        if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                            name.push(c);
                            chars.next();
                        } else {
                            break;
                        }
                    }
                    let idx = params.len() + 1;
                    out.push('$');
                    out.push_str(&idx.to_string());
                    params.push(name);
                    continue;
                }
            }
        }
        out.push(ch);
    }
    (out, params)
}

fn bind_values<'a>(
    mut query: Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    values: Vec<Value>,
) -> Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments> {
    for value in values {
        match value {
            Value::Null => {
                let v: Option<String> = None;
                query = query.bind(v);
            }
            Value::Bool(b) => query = query.bind(b),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(n.to_string());
                }
            }
            Value::String(s) => query = query.bind(s),
            Value::Array(_) | Value::Object(_) => {
                query = query.bind(sqlx::types::Json(value));
            }
        }
    }
    query
}

fn check_rate_limit(state: &AppState, ip: Option<&str>) -> bool {
    let key = ip.unwrap_or("unknown").to_string();
    let now = std::time::Instant::now();
    let window = std::time::Duration::from_secs(state.config.rate_limit_window_secs);

    let mut limits = state.rate_limits.write().unwrap();
    let entry = limits.entry(key).or_insert(crate::state::RateLimitState {
        window_start: now,
        count: 0,
    });

    if now.duration_since(entry.window_start) > window {
        entry.window_start = now;
        entry.count = 0;
    }

    if entry.count >= state.config.rate_limit_max {
        return false;
    }

    entry.count += 1;
    true
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

async fn delete_s3_objects(
    storage: &stk_core::storage::StorageConfig,
    deletes: &[(String, String)],
) -> Result<()> {
    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let client = aws_sdk_s3::Client::new(&config);

    for (bucket_alias, key) in deletes {
        let Some(bucket_cfg) = storage.buckets.get(bucket_alias) else {
            tracing::warn!("Missing bucket config for alias {}", bucket_alias);
            continue;
        };
        let resp = client
            .delete_object()
            .bucket(&bucket_cfg.bucket)
            .key(key)
            .send()
            .await;
        if let Err(e) = resp {
            tracing::warn!("Failed to delete {} from {}: {}", key, bucket_cfg.bucket, e);
        }
    }

    Ok(())
}
