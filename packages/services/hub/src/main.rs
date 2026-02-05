//! Santokit Hub (Control Plane)
//!
//! org/team/project/env 관리, 스키마/권한/릴리즈 관리를 담당합니다.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use stk_core::auth::{ApiKey, ApiKeyFull, ApiKeyStatus};
use stk_core::permissions::PermissionPolicy;
use stk_core::schema::{ProjectSchema, SchemaParser};
use stk_core::storage::StorageConfig;

mod crypto;
mod db;

use crypto::parse_key_material;
use db::{
    compute_snapshot_hash, connections_map, ConnectionInfo, HubDb, ReleaseRow,
};
use rusty_paseto::core::{Key, Local, PasetoSymmetricKey, V4};
use rusty_paseto::prelude::*;
use base64::Engine as _;
use sqlx::Connection;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "stk_hub=debug,tower_http=debug".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = std::env::var("STK_HUB_DB_URL")
        .unwrap_or_else(|_| "sqlite://.context/hub.db".to_string());

    if let Some(path) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let secret_key = std::env::var("STK_HUB_SECRET_KEY")
        .ok()
        .and_then(|k| parse_key_material(&k))
        .unwrap_or_else(|| *b"dev-secret-key-32bytes-long!!!!!");

    let paseto_keys = parse_paseto_keys();

    let db = HubDb::new(&db_url, secret_key).await?;
    let state = HubState {
        db: Arc::new(db),
        paseto_keys,
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/projects", post(create_project).get(list_projects))
        .route("/api/projects/:id/envs", post(create_env).get(list_envs))
        .route("/api/connections", post(set_connection).get(list_connections))
        .route("/api/connections/:name/test", post(test_connection))
        .route("/api/apikeys", post(create_apikey).get(list_apikeys))
        .route("/api/apikeys/:id", delete(revoke_apikey))
        .route("/api/apply", post(apply))
        .route("/api/releases", get(list_releases))
        .route("/api/releases/current", get(current_release))
        .route("/api/releases/:id", get(show_release))
        .route("/api/releases/promote", post(promote_release))
        .route("/api/releases/rollback", post(rollback_release))
        .route("/api/endusers/signup", post(enduser_signup))
        .route("/api/endusers/login", post(enduser_login))
        .route("/api/endusers/token", post(enduser_token))
        .route("/api/endusers/logout", post(enduser_logout))
        .route(
            "/internal/releases/:project/:env/current",
            get(internal_current_release),
        )
        .route("/internal/apikeys/verify", post(internal_verify_apikey))
        .with_state(state);

    let port: u16 = std::env::var("STK_HUB_PORT")
        .unwrap_or_else(|_| "4000".to_string())
        .parse()?;

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Hub listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

#[derive(Clone)]
struct HubState {
    db: Arc<HubDb>,
    paseto_keys: Vec<[u8; 32]>,
}

#[derive(Debug, thiserror::Error)]
enum HubError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    error: ErrorBody,
}

#[derive(Serialize)]
struct ErrorBody {
    code: String,
    message: String,
}

impl IntoResponse for HubError {
    fn into_response(self) -> axum::response::Response {
        let (status, code, message) = match &self {
            HubError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            HubError::Unauthorized(msg) => {
                (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone())
            }
            HubError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            HubError::Internal(msg) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", msg.clone())
            }
        };

        let body = ErrorResponse {
            error: ErrorBody {
                code: code.to_string(),
                message,
            },
        };

        (status, Json(body)).into_response()
    }
}

type Result<T> = std::result::Result<T, HubError>;

fn parse_paseto_keys() -> Vec<[u8; 32]> {
    std::env::var("STK_PASETO_KEYS")
        .ok()
        .map(|val| {
            val.split(',')
                .filter_map(|s| parse_key_material(s))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

async fn require_auth(headers: &HeaderMap, state: &HubState) -> Result<db::OperatorRow> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| HubError::Unauthorized("Missing Bearer token".to_string()))?;

    let operator = state
        .db
        .get_operator_by_token(token)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::Unauthorized("Invalid token".to_string()))?;

    Ok(operator)
}

fn hash_password(password: &str) -> Result<String> {
    use argon2::password_hash::{PasswordHasher, SaltString};
    let salt = SaltString::generate(&mut rand::thread_rng());
    let argon2 = argon2::Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| HubError::Internal(format!("password hash failed: {}", e)))?
        .to_string();
    Ok(hash)
}

fn verify_password(hash: &str, password: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    argon2::Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn new_token() -> String {
    ulid::Ulid::new().to_string()
}

fn new_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    email: String,
    roles: Vec<String>,
}

async fn login(State(state): State<HubState>, Json(req): Json<LoginRequest>) -> Result<Json<LoginResponse>> {
    let db = state.db.clone();
    let existing = db
        .get_operator_by_email(&req.email)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let operator = if let Some(op) = existing {
        if !verify_password(&op.password_hash, &req.password) {
            return Err(HubError::Unauthorized("Invalid credentials".to_string()));
        }
        op
    } else {
        let hash = hash_password(&req.password)?;
        db.upsert_operator(&req.email, &hash, &vec!["owner".to_string()])
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
    };

    let token = new_token();
    db.insert_session(&token, &operator.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let roles = operator
        .roles()
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(LoginResponse {
        token,
        email: operator.email,
        roles,
    }))
}

async fn logout(State(state): State<HubState>, headers: HeaderMap) -> Result<Json<serde_json::Value>> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| HubError::Unauthorized("Missing Bearer token".to_string()))?;

    state
        .db
        .delete_session(token)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn me(State(state): State<HubState>, headers: HeaderMap) -> Result<Json<serde_json::Value>> {
    let operator = require_auth(&headers, &state).await?;
    let roles = operator.roles().map_err(|e| HubError::Internal(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "email": operator.email,
        "roles": roles
    })))
}

#[derive(Deserialize)]
struct CreateProjectRequest {
    name: String,
}

async fn create_project(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<CreateProjectRequest>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;

    let db = state.db.clone();
    if db
        .get_project_by_name(&req.name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .is_some()
    {
        return Err(HubError::BadRequest("Project already exists".to_string()));
    }

    let project = db
        .create_project(&req.name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "name": project.name,
        "created_at": project.created_at
    })))
}

async fn list_projects(State(state): State<HubState>, headers: HeaderMap) -> Result<Json<Vec<serde_json::Value>>> {
    let _ = require_auth(&headers, &state).await?;
    let rows = state
        .db
        .list_projects()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let list = rows
        .into_iter()
        .map(|p| serde_json::json!({ "name": p.name, "created_at": p.created_at }))
        .collect();
    Ok(Json(list))
}

#[derive(Deserialize)]
struct CreateEnvRequest {
    name: String,
}

async fn create_env(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(project): Path<String>,
    Json(req): Json<CreateEnvRequest>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;

    if db
        .get_env(&project_row.id, &req.name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .is_some()
    {
        return Err(HubError::BadRequest("Env already exists".to_string()));
    }

    let env = db
        .create_env(&project_row.id, &req.name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "name": env.name,
        "created_at": env.created_at
    })))
}

async fn list_envs(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(project): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;

    let envs = db
        .list_envs(&project_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(
        envs.into_iter()
            .map(|env| serde_json::json!({ "name": env.name, "created_at": env.created_at }))
            .collect(),
    ))
}

#[derive(Deserialize)]
struct SetConnectionRequest {
    project: String,
    env: String,
    name: String,
    engine: String,
    db_url: String,
}

async fn set_connection(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<SetConnectionRequest>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    let conn = db
        .upsert_connection(&project_row.id, &env_row.id, &req.name, &req.engine, &req.db_url)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "name": conn.name,
        "engine": conn.engine,
        "created_at": conn.created_at
    })))
}

#[derive(Deserialize)]
struct ListConnectionsQuery {
    project: String,
    env: String,
}

async fn list_connections(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<ListConnectionsQuery>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    let list = db
        .list_connections(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let mut response = Vec::new();
    for c in list {
        let db_url = db
            .decrypt_db_url(&c)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        response.push(serde_json::json!({
            "name": c.name,
            "engine": c.engine,
            "db_url": db_url,
            "created_at": c.created_at
        }));
    }
    Ok(Json(response))
}

#[derive(Deserialize)]
struct TestConnectionQuery {
    project: String,
    env: String,
}

async fn test_connection(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<TestConnectionQuery>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    let conn = db
        .get_connection(&project_row.id, &env_row.id, &name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Connection not found".to_string()))?;

    let db_url = db
        .decrypt_db_url(&conn)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let ok = match conn.engine.as_str() {
        "postgres" => sqlx::postgres::PgConnection::connect(&db_url).await.is_ok(),
        _ => false,
    };

    Ok(Json(serde_json::json!({ "ok": ok })))
}

#[derive(Deserialize)]
struct CreateApiKeyRequest {
    project: String,
    env: String,
    name: String,
    roles: Vec<String>,
}

#[derive(Serialize)]
struct CreateApiKeyResponse {
    key_id: String,
    api_key: String,
    roles: Vec<String>,
}

async fn create_apikey(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<CreateApiKeyRequest>,
) -> Result<Json<CreateApiKeyResponse>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    let secret = new_secret();
    let secret_hash = hash_password(&secret)?;

    let key = db
        .create_api_key(
            &project_row.id,
            &env_row.id,
            &req.name,
            &req.roles,
            ApiKeyStatus::Active,
            &secret_hash,
        )
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let api_key = ApiKeyFull {
        key_id: key.id.clone(),
        secret,
    };

    Ok(Json(CreateApiKeyResponse {
        key_id: key.id.0,
        api_key: api_key.to_header_value(),
        roles: key.roles,
    }))
}

#[derive(Deserialize)]
struct ListApiKeysQuery {
    project: String,
    env: String,
}

async fn list_apikeys(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<ListApiKeysQuery>,
) -> Result<Json<Vec<ApiKey>>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    let keys = db
        .list_api_keys(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(keys))
}

#[derive(Deserialize)]
struct RevokeApiKeyQuery {
    project: String,
    env: String,
}

async fn revoke_apikey(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<RevokeApiKeyQuery>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    db.revoke_api_key(&id, &project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct ApplyRequest {
    project: String,
    env: String,
    r#ref: String,
    only: Option<Vec<String>>,
    dry_run: bool,
    #[allow(dead_code)]
    force: bool,
    schema: Vec<String>,
    permissions: Option<String>,
    storage: Option<String>,
}

#[derive(Serialize)]
struct ApplyResponse {
    project: String,
    env: String,
    r#ref: String,
    dry_run: bool,
    release_id: Option<String>,
    reused: bool,
    plan: Vec<String>,
}

#[derive(Default)]
struct OnlySet {
    schema: bool,
    permissions: bool,
    release: bool,
}

fn parse_only(only: &Option<Vec<String>>) -> OnlySet {
    if let Some(values) = only {
        let mut set = OnlySet::default();
        for v in values {
            match v.as_str() {
                "schema" => set.schema = true,
                "permissions" => set.permissions = true,
                "release" => set.release = true,
                _ => {}
            }
        }
        set
    } else {
        OnlySet {
            schema: true,
            permissions: true,
            release: true,
        }
    }
}

async fn apply(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<ApplyRequest>,
) -> Result<Json<ApplyResponse>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let only = parse_only(&req.only);

    let schema = if only.schema {
        if req.schema.is_empty() {
            return Err(HubError::BadRequest("schema files are required".to_string()));
        }
        let yamls: Vec<&str> = req.schema.iter().map(|s| s.as_str()).collect();
        SchemaParser::parse_multiple(&yamls).map_err(|e| HubError::BadRequest(e.to_string()))?
    } else {
        ProjectSchema::default()
    };

    let permissions = if only.permissions {
        if let Some(perms) = &req.permissions {
            if perms.trim().is_empty() {
                PermissionPolicy::default()
            } else {
                serde_yaml::from_str(perms).map_err(|e| HubError::BadRequest(e.to_string()))?
            }
        } else {
            PermissionPolicy::default()
        }
    } else {
        PermissionPolicy::default()
    };

    let storage = if let Some(storage_yaml) = &req.storage {
        if storage_yaml.trim().is_empty() {
            StorageConfig::default()
        } else {
            serde_yaml::from_str(storage_yaml)
                .map_err(|e| HubError::BadRequest(e.to_string()))?
        }
    } else {
        StorageConfig::default()
    };

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    let mut plan = Vec::new();
    if only.schema {
        let connections = db
            .list_connections(&project_row.id, &env_row.id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;

        for (conn_name, schema_ir) in &schema.connections {
            let conn = connections
                .iter()
                .find(|c| c.name == *conn_name)
                .ok_or_else(|| HubError::BadRequest(format!("Missing connection: {}", conn_name)))?;

            let db_url = db
                .decrypt_db_url(conn)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
            let steps = apply_schema_to_postgres(&db_url, schema_ir, req.dry_run, req.force)
                .await
                .map_err(|e| HubError::BadRequest(e))?;
            plan.extend(steps);
        }
    }

    let mut release_id = None;
    let mut reused = false;

    if only.release && !req.dry_run {
        let snapshot_hash = compute_snapshot_hash(&schema, &permissions, &storage, &req.r#ref)
            .map_err(|e| HubError::Internal(e.to_string()))?;

        if let Some(existing) = db
            .find_release_by_hash(&project_row.id, &env_row.id, &snapshot_hash)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
        {
            release_id = Some(existing.id.clone());
            reused = true;
        } else {
            let release = db
                .create_release(
                    &project_row.id,
                    &env_row.id,
                    &req.r#ref,
                    &schema,
                    &permissions,
                    &storage,
                    &snapshot_hash,
                )
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
            release_id = Some(release.id.clone());
        }

        if let Some(rid) = &release_id {
            db.set_current_release(&project_row.id, &env_row.id, rid)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
        }
    }

    Ok(Json(ApplyResponse {
        project: req.project,
        env: req.env,
        r#ref: req.r#ref,
        dry_run: req.dry_run,
        release_id,
        reused,
        plan,
    }))
}

#[derive(Deserialize)]
struct ReleaseQuery {
    project: String,
    env: String,
    limit: Option<usize>,
}

async fn list_releases(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<ReleaseQuery>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    let list = db
        .list_releases(&project_row.id, &env_row.id, query.limit)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(
        list.into_iter()
            .map(|r| release_to_json(&r))
            .collect(),
    ))
}

async fn current_release(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<ReleaseQuery>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;

    let rid = db
        .get_current_release(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("No current release".to_string()))?;

    let release = db
        .get_release(&rid)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Release not found".to_string()))?;

    Ok(Json(release_to_json(&release)))
}

async fn show_release(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let release = state
        .db
        .get_release(&id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Release not found".to_string()))?;

    Ok(Json(release_to_json(&release)))
}

#[derive(Deserialize)]
struct PromoteRequest {
    project: String,
    from: Option<String>,
    to: String,
    release_id: Option<String>,
}

async fn promote_release(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<PromoteRequest>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&req.project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;

    let release_id = if let Some(rid) = req.release_id {
        rid
    } else if let Some(from_env) = req.from {
        let env_row = db
            .get_env(&project_row.id, &from_env)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
            .ok_or_else(|| HubError::NotFound("Env not found".to_string()))?;
        db.get_current_release(&project_row.id, &env_row.id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
            .ok_or_else(|| HubError::NotFound("Source env has no current release".to_string()))?
    } else {
        let env_row = db
            .get_env(&project_row.id, &req.to)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
            .ok_or_else(|| HubError::NotFound("Env not found".to_string()))?;
        db.get_current_release(&project_row.id, &env_row.id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
            .ok_or_else(|| HubError::NotFound("No release to promote".to_string()))?
    };

    let to_env = db
        .get_env(&project_row.id, &req.to)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Target env not found".to_string()))?;

    db.set_current_release(&project_row.id, &to_env.id, &release_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true, "release_id": release_id })))
}

#[derive(Deserialize)]
struct RollbackRequest {
    project: String,
    env: String,
    to_release_id: String,
}

async fn rollback_release(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<RollbackRequest>,
) -> Result<Json<serde_json::Value>> {
    let _ = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    db.set_current_release(&project_row.id, &env_row.id, &req.to_release_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true, "release_id": req.to_release_id })))
}

#[derive(Serialize)]
struct InternalReleaseResponse {
    release_id: String,
    schema: ProjectSchema,
    permissions: PermissionPolicy,
    storage: StorageConfig,
    connections: std::collections::HashMap<String, ConnectionInfo>,
}

async fn internal_current_release(
    State(state): State<HubState>,
    Path((project, env)): Path<(String, String)>,
) -> Result<Json<InternalReleaseResponse>> {
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &project, &env).await?;

    let rid = db
        .get_current_release(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("No current release".to_string()))?;

    let release = db
        .get_release(&rid)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Release not found".to_string()))?;

    let schema = release.schema().map_err(|e| HubError::Internal(e.to_string()))?;
    let permissions = release.permissions().map_err(|e| HubError::Internal(e.to_string()))?;
    let storage = release.storage().map_err(|e| HubError::Internal(e.to_string()))?;

    let connections = db
        .list_connections(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;
    let decrypted = futures::future::try_join_all(
        connections
            .iter()
            .map(|c| db.decrypt_db_url(c)),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    let connections_map = connections_map(&connections, &decrypted);

    Ok(Json(InternalReleaseResponse {
        release_id: release.id,
        schema,
        permissions,
        storage,
        connections: connections_map,
    }))
}

#[derive(Deserialize)]
struct VerifyApiKeyRequest {
    key_id: String,
    secret: String,
}

#[derive(Serialize)]
struct VerifyApiKeyResponse {
    valid: bool,
    key: Option<ApiKey>,
}

async fn internal_verify_apikey(
    State(state): State<HubState>,
    Json(req): Json<VerifyApiKeyRequest>,
) -> Result<Json<VerifyApiKeyResponse>> {
    let db = state.db.clone();
    let key_row = db
        .get_api_key(&req.key_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let Some(row) = key_row else {
        return Ok(Json(VerifyApiKeyResponse { valid: false, key: None }));
    };

    if ApiKeyStatus::from_str(&row.status).unwrap_or(ApiKeyStatus::Revoked) != ApiKeyStatus::Active {
        return Ok(Json(VerifyApiKeyResponse { valid: false, key: None }));
    }

    if !verify_password(&row.secret_hash, &req.secret) {
        return Ok(Json(VerifyApiKeyResponse { valid: false, key: None }));
    }

    let key = row.into_api_key().map_err(|e| HubError::Internal(e.to_string()))?;
    db.update_api_key_last_used(&key.id.0, Utc::now())
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(VerifyApiKeyResponse { valid: true, key: Some(key) }))
}

#[derive(Deserialize)]
struct EndUserSignupRequest {
    project: String,
    env: String,
    email: String,
    password: String,
}

async fn enduser_signup(
    State(state): State<HubState>,
    Json(req): Json<EndUserSignupRequest>,
) -> Result<Json<serde_json::Value>> {
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    if db
        .get_end_user(&project_row.id, &env_row.id, &req.email)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .is_some()
    {
        return Err(HubError::BadRequest("End user already exists".to_string()));
    }

    let hash = hash_password(&req.password)?;
    db.create_end_user(&project_row.id, &env_row.id, &req.email, &hash, &vec!["user".to_string()])
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct EndUserLoginRequest {
    project: String,
    env: String,
    email: String,
    password: String,
}

#[derive(Serialize)]
struct EndUserAuthResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
}

async fn enduser_login(
    State(state): State<HubState>,
    Json(req): Json<EndUserLoginRequest>,
) -> Result<Json<EndUserAuthResponse>> {
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    let end_user = db
        .get_end_user(&project_row.id, &env_row.id, &req.email)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::Unauthorized("Invalid credentials".to_string()))?;

    if !verify_password(&end_user.password_hash, &req.password) {
        return Err(HubError::Unauthorized("Invalid credentials".to_string()));
    }

    let ttl_seconds = std::env::var("STK_ACCESS_TTL")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(3600);

    let token = issue_access_token(
        &state.paseto_keys,
        &end_user.id,
        &project_row.id,
        &env_row.id,
        &end_user.roles,
        ttl_seconds,
    )?;

    let refresh = issue_refresh_token(&db, &end_user.id, &project_row.id, &env_row.id)
        .await?;

    Ok(Json(EndUserAuthResponse {
        access_token: token,
        refresh_token: refresh.token,
        expires_in: ttl_seconds,
    }))
}

#[derive(Deserialize)]
struct EndUserTokenRequest {
    project: String,
    env: String,
    refresh_token: String,
}

async fn enduser_token(
    State(state): State<HubState>,
    Json(req): Json<EndUserTokenRequest>,
) -> Result<Json<EndUserAuthResponse>> {
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;

    let (token_id, secret) = parse_refresh_token(&req.refresh_token)
        .ok_or_else(|| HubError::Unauthorized("Invalid refresh token".to_string()))?;

    let token_row = db
        .get_refresh_token(&token_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::Unauthorized("Invalid refresh token".to_string()))?;

    if token_row.project_id != project_row.id || token_row.env_id != env_row.id {
        return Err(HubError::Unauthorized("Invalid refresh token".to_string()));
    }

    if token_row.revoked_at.is_some() {
        return Err(HubError::Unauthorized("Refresh token revoked".to_string()));
    }

    let expires_at = DateTime::parse_from_rfc3339(&token_row.expires_at)
        .map_err(|e| HubError::Internal(e.to_string()))?
        .with_timezone(&Utc);

    if expires_at <= Utc::now() {
        return Err(HubError::Unauthorized("Refresh token expired".to_string()));
    }

    if !verify_password(&token_row.token_hash, &secret) {
        return Err(HubError::Unauthorized("Invalid refresh token".to_string()));
    }

    let end_user = db
        .get_end_user_by_id(&token_row.end_user_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::Unauthorized("End user not found".to_string()))?;

    if end_user.project_id != project_row.id || end_user.env_id != env_row.id {
        return Err(HubError::Unauthorized("Invalid refresh token".to_string()));
    }

    let ttl_seconds = std::env::var("STK_ACCESS_TTL")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(3600);

    let token = issue_access_token(
        &state.paseto_keys,
        &end_user.id,
        &project_row.id,
        &env_row.id,
        &end_user.roles,
        ttl_seconds,
    )?;

    Ok(Json(EndUserAuthResponse {
        access_token: token,
        refresh_token: req.refresh_token,
        expires_in: ttl_seconds,
    }))
}

#[derive(Deserialize)]
struct EndUserLogoutRequest {
    refresh_token: String,
}

async fn enduser_logout(
    State(state): State<HubState>,
    Json(req): Json<EndUserLogoutRequest>,
) -> Result<Json<serde_json::Value>> {
    let db = state.db.clone();

    let (token_id, _) = parse_refresh_token(&req.refresh_token)
        .ok_or_else(|| HubError::Unauthorized("Invalid refresh token".to_string()))?;

    db.revoke_refresh_token(&token_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

fn issue_access_token(
    keys: &[ [u8;32] ],
    user_id: &str,
    project_id: &str,
    env_id: &str,
    roles: &[String],
    ttl_seconds: i64,
) -> Result<String> {
    let key = keys
        .first()
        .ok_or_else(|| HubError::Internal("No PASETO keys configured".to_string()))?;

    let now = Utc::now();
    let exp = now + Duration::seconds(ttl_seconds);
    let jti = ulid::Ulid::new().to_string();

    let paseto_key = PasetoSymmetricKey::<V4, Local>::from(Key::from(*key));

    let token = PasetoBuilder::<V4, Local>::default()
        .set_claim(SubjectClaim::from(user_id))
        .set_claim(IssuedAtClaim::try_from(now.to_rfc3339()).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(ExpirationClaim::try_from(exp.to_rfc3339()).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(TokenIdentifierClaim::from(jti.as_str()))
        .set_claim(CustomClaim::try_from(("project_id", project_id)).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(CustomClaim::try_from(("env_id", env_id)).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(CustomClaim::try_from(("roles", roles.to_vec())).map_err(|e| HubError::Internal(e.to_string()))?)
        .build(&paseto_key)
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(token)
}

struct RefreshTokenIssued {
    token: String,
}

async fn issue_refresh_token(
    db: &HubDb,
    end_user_id: &str,
    project_id: &str,
    env_id: &str,
) -> Result<RefreshTokenIssued> {
    let secret = new_secret();
    let token_hash = hash_password(&secret)?;
    let expires_at = Utc::now() + Duration::days(30);

    let token_id = db
        .insert_refresh_token(end_user_id, project_id, env_id, &token_hash, expires_at)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(RefreshTokenIssued {
        token: format!("rt_{}:{}", token_id, secret),
    })
}

fn parse_refresh_token(token: &str) -> Option<(String, String)> {
    let token = token.strip_prefix("rt_")?;
    let parts: Vec<&str> = token.splitn(2, ':').collect();
    if parts.len() != 2 {
        return None;
    }
    Some((parts[0].to_string(), parts[1].to_string()))
}

fn release_to_json(r: &ReleaseRow) -> serde_json::Value {
    serde_json::json!({
        "release_id": r.id,
        "project": r.project_id,
        "env": r.env_id,
        "ref": r.reference,
        "created_at": r.created_at
    })
}

async fn resolve_project_env(db: &HubDb, project: &str, env: &str) -> Result<(db::ProjectRow, db::EnvRow)> {
    let project_row = db
        .get_project_by_name(project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;

    let env_row = db
        .get_env(&project_row.id, env)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Env not found".to_string()))?;

    Ok((project_row, env_row))
}

async fn apply_schema_to_postgres(
    db_url: &str,
    schema_ir: &stk_core::schema::SchemaIr,
    dry_run: bool,
    force: bool,
) -> std::result::Result<Vec<String>, String> {
    use stk_sql::ddl::DdlGenerator;
    use std::collections::HashSet;

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(db_url)
        .await
        .map_err(|e| format!("DB connect failed: {}", e))?;

    let existing_tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_table_set: HashSet<String> = existing_tables.into_iter().collect();
    let mut plan = Vec::new();

    for table in schema_ir.all_tables() {
        if !existing_table_set.contains(&table.name) {
            let ddl = DdlGenerator::create_table(table);
            plan.push(format!("create table {}", table.name));
            if !dry_run {
                sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
            }
            continue;
        }

        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = $1",
        )
        .bind(&table.name)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut existing_columns: HashSet<String> = rows.into_iter().map(|r| r.0).collect();

        for column in table.columns.iter().map(|c| &c.name).chain(std::iter::once(&table.id.name)) {
            if !existing_columns.remove(column) {
                let col_def = if column == &table.id.name {
                    None
                } else {
                    table.find_column(column)
                };

                if column == &table.id.name {
                    if !force {
                        return Err(format!("Missing id column {}.{}", table.name, column));
                    }
                } else if let Some(col) = col_def {
                    if !col.nullable && col.default.is_none() && !force {
                        return Err(format!(
                            "Missing non-nullable column {}.{} without default",
                            table.name, col.name
                        ));
                    }
                    let ddl = DdlGenerator::add_column(&table.name, col);
                    plan.push(format!("add column {}.{}", table.name, col.name));
                    if !dry_run {
                        sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                    }
                }
            }
        }

        if !existing_columns.is_empty() {
            if !force {
                return Err(format!("Drift detected in table {}", table.name));
            }
            for col in existing_columns {
                let ddl = DdlGenerator::drop_column(&table.name, &col);
                plan.push(format!("drop column {}.{}", table.name, col));
                if !dry_run {
                    sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                }
            }
        }
    }

    if !force {
        let schema_tables: HashSet<String> = schema_ir.table_names().map(|s| s.to_string()).collect();
        for table in existing_table_set {
            if !schema_tables.contains(&table) {
                return Err(format!("Drift detected: extra table {}", table));
            }
        }
    } else {
        for table in existing_table_set {
            if !schema_ir.has_table(&table) {
                let ddl = DdlGenerator::drop_table(&table);
                plan.push(format!("drop table {}", table));
                if !dry_run {
                    sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(plan)
}
