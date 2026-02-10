//! Santokit Hub (Control Plane)
//!
//! org/team/project/env 관리, 스키마/권한/릴리즈 관리를 담당합니다.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{header::SET_COOKIE, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, DecodingKey, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use url::Url;

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
use sqlx::{Connection, Row};

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
        let path = std::path::Path::new(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if path != std::path::Path::new(":memory:") && !path.exists() {
            std::fs::File::create(path)?;
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
        .route("/api/projects/{id}/operators", post(add_project_operator))
        .route("/api/projects/{id}/envs", post(create_env).get(list_envs))
        .route("/api/connections", post(set_connection).get(list_connections))
        .route("/api/connections/{name}/test", post(test_connection))
        .route("/api/operators", get(list_operators))
        .route("/api/operators/invite", post(invite_operator))
        .route("/api/operators/{id}/roles", post(update_operator_roles))
        .route("/api/operators/{id}/status", post(update_operator_status))
        .route("/api/apikeys", post(create_apikey).get(list_apikeys))
        .route("/api/apikeys/{id}", delete(revoke_apikey))
        .route("/api/audit/logs", get(list_audit_logs))
        .route("/api/schema/snapshot", post(schema_snapshot))
        .route("/api/schema/drift", post(schema_drift))
        .route("/api/apply", post(apply))
        .route("/api/releases", get(list_releases))
        .route("/api/releases/current", get(current_release))
        .route("/api/releases/{id}", get(show_release))
        .route("/api/releases/promote", post(promote_release))
        .route("/api/releases/rollback", post(rollback_release))
        .route("/api/oidc/providers", post(set_oidc_provider).get(list_oidc_providers))
        .route("/api/oidc/providers/{name}", delete(delete_oidc_provider))
        .route("/api/endusers/signup", post(enduser_signup))
        .route("/api/endusers/login", post(enduser_login))
        .route("/api/endusers/token", post(enduser_token))
        .route("/api/endusers/logout", post(enduser_logout))
        .route("/oidc/{provider}/start", get(oidc_start))
        .route("/oidc/{provider}/callback", get(oidc_callback))
        .route(
            "/internal/releases/{project}/{env}/current",
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
    paseto_keys: Vec<PasetoKey>,
}

#[derive(Debug, thiserror::Error)]
enum HubError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
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
            HubError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
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

#[derive(Clone)]
struct PasetoKey {
    kid: Option<String>,
    key: [u8; 32],
}

fn parse_paseto_entry(raw: &str) -> Option<PasetoKey> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (kid, material) = if let Some((k, v)) = trimmed.split_once(':') {
        (Some(k.trim().to_string()), v.trim())
    } else {
        (None, trimmed)
    };

    let key = parse_key_material(material)?;
    Some(PasetoKey { kid, key })
}

fn parse_paseto_keys() -> Vec<PasetoKey> {
    std::env::var("STK_PASETO_KEYS")
        .ok()
        .map(|val| {
            val.split(',')
                .filter_map(parse_paseto_entry)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn require_owner(operator: &db::OperatorRow) -> Result<()> {
    let roles = operator
        .roles()
        .map_err(|e| HubError::Internal(e.to_string()))?;
    if roles.iter().any(|r| r == "owner") {
        Ok(())
    } else {
        Err(HubError::Forbidden("Owner role required".to_string()))
    }
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

    if !operator.is_active() {
        return Err(HubError::Forbidden("Operator disabled".to_string()));
    }

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

fn cookie_name(prefix: &str, project: &str, env: &str) -> String {
    format!("{}_{}_{}", prefix, project, env)
}

fn build_cookie(name: &str, value: &str, max_age: i64) -> String {
    let secure = std::env::var("STK_COOKIE_SECURE")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false);
    let domain = std::env::var("STK_COOKIE_DOMAIN").ok();

    let mut parts = vec![
        format!("{}={}", name, value),
        "HttpOnly".to_string(),
        "SameSite=Lax".to_string(),
        "Path=/".to_string(),
        format!("Max-Age={}", max_age),
    ];

    if secure {
        parts.push("Secure".to_string());
    }
    if let Some(domain) = domain {
        parts.push(format!("Domain={}", domain));
    }

    parts.join("; ")
}

fn build_clear_cookie(name: &str) -> String {
    let mut parts = vec![
        format!("{}=", name),
        "HttpOnly".to_string(),
        "SameSite=Lax".to_string(),
        "Path=/".to_string(),
        "Max-Age=0".to_string(),
    ];
    if let Ok(domain) = std::env::var("STK_COOKIE_DOMAIN") {
        if !domain.trim().is_empty() {
            parts.push(format!("Domain={}", domain));
        }
    }
    parts.join("; ")
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
        if !op.is_active() {
            return Err(HubError::Unauthorized("Operator disabled".to_string()));
        }
        op
    } else {
        let hash = hash_password(&req.password)?;
        db.upsert_operator(&req.email, &hash, &vec!["owner".to_string()])
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
    };

    db.ensure_default_team(&operator.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

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
    let operator = require_auth(&headers, &state).await?;

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
        .create_project(&req.name, &operator.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "project.create",
        "project",
        Some(&project.id),
        Some(&project.id),
        None,
        Some(serde_json::json!({ "name": project.name })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "name": project.name,
        "created_at": project.created_at
    })))
}

async fn list_projects(State(state): State<HubState>, headers: HeaderMap) -> Result<Json<Vec<serde_json::Value>>> {
    let operator = require_auth(&headers, &state).await?;
    let rows = state
        .db
        .list_projects(&operator.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let list = rows
        .into_iter()
        .map(|p| serde_json::json!({ "name": p.name, "created_at": p.created_at }))
        .collect();
    Ok(Json(list))
}

#[derive(Serialize)]
struct OperatorResponse {
    id: String,
    email: String,
    roles: Vec<String>,
    status: String,
    created_at: String,
}

async fn list_operators(
    State(state): State<HubState>,
    headers: HeaderMap,
) -> Result<Json<Vec<OperatorResponse>>> {
    let operator = require_auth(&headers, &state).await?;
    require_owner(&operator)?;

    let rows = state
        .db
        .list_operators()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let list = rows
        .into_iter()
        .map(|o| {
            let roles = o.roles().unwrap_or_default();
            OperatorResponse {
                id: o.id,
                email: o.email,
                roles,
                status: o.status,
                created_at: o.created_at,
            }
        })
        .collect();

    Ok(Json(list))
}

#[derive(Deserialize)]
struct UpdateOperatorRolesRequest {
    roles: Vec<String>,
}

async fn update_operator_roles(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateOperatorRolesRequest>,
) -> Result<Json<serde_json::Value>> {
    let operator = require_auth(&headers, &state).await?;
    require_owner(&operator)?;

    state
        .db
        .update_operator_roles(&id, &req.roles)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct UpdateOperatorStatusRequest {
    status: String,
}

async fn update_operator_status(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<UpdateOperatorStatusRequest>,
) -> Result<Json<serde_json::Value>> {
    let operator = require_auth(&headers, &state).await?;
    require_owner(&operator)?;

    let status = req.status.as_str();
    if status != "active" && status != "disabled" {
        return Err(HubError::BadRequest("Invalid status".to_string()));
    }

    state
        .db
        .update_operator_status(&id, status)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct InviteOperatorRequest {
    email: String,
    roles: Vec<String>,
}

#[derive(Serialize)]
struct InviteOperatorResponse {
    id: String,
    email: String,
    roles: Vec<String>,
    status: String,
    temp_password: String,
}

async fn invite_operator(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<InviteOperatorRequest>,
) -> Result<Json<InviteOperatorResponse>> {
    let operator = require_auth(&headers, &state).await?;
    require_owner(&operator)?;

    if req.roles.is_empty() {
        return Err(HubError::BadRequest("roles are required".to_string()));
    }

    let temp_password = new_secret();
    let hash = hash_password(&temp_password)?;
    let invited = state
        .db
        .upsert_operator(&req.email, &hash, &req.roles)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;
    state
        .db
        .update_operator_status(&invited.id, "active")
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;
    state
        .db
        .ensure_default_team(&invited.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    state
        .db
        .insert_audit_log(
            &operator.id,
            "operator.invite",
            "operator",
            Some(&invited.id),
            None,
            None,
            Some(serde_json::json!({ "email": invited.email, "roles": req.roles })),
        )
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(InviteOperatorResponse {
        id: invited.id,
        email: invited.email,
        roles: req.roles,
        status: "active".to_string(),
        temp_password,
    }))
}

#[derive(Deserialize)]
struct AddProjectOperatorRequest {
    email: String,
    role: String,
}

async fn add_project_operator(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(project): Path<String>,
    Json(req): Json<AddProjectOperatorRequest>,
) -> Result<Json<serde_json::Value>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let target = db
        .get_operator_by_email(&req.email)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Operator not found".to_string()))?;

    let team_id = if let Some(team_id) = db
        .get_project_team_id(&project_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
    {
        team_id
    } else {
        let team_id = db
            .ensure_default_team(&operator.id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        db.add_project_team(&project_row.id, &team_id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        team_id
    };

    db.add_operator_membership(&target.id, &team_id, &req.role)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "project.operator.add",
        "project",
        Some(&project_row.id),
        Some(&project_row.id),
        None,
        Some(serde_json::json!({ "email": target.email, "role": req.role })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

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

    db.insert_audit_log(
        &operator.id,
        "env.create",
        "env",
        Some(&env.id),
        Some(&project_row.id),
        Some(&env.id),
        Some(serde_json::json!({ "project": project_row.name, "name": env.name })),
    )
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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let conn = db
        .upsert_connection(&project_row.id, &env_row.id, &req.name, &req.engine, &req.db_url)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "connection.set",
        "connection",
        Some(&conn.id),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({
            "project": project_row.name,
            "env": env_row.name,
            "name": conn.name,
            "engine": conn.engine,
        })),
    )
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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

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

    db.insert_audit_log(
        &operator.id,
        "apikey.create",
        "api_key",
        Some(&key.id.0),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({
            "project": project_row.name,
            "env": env_row.name,
            "name": req.name,
            "roles": req.roles,
        })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    db.revoke_api_key(&id, &project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "apikey.revoke",
        "api_key",
        Some(&id),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({ "project": project_row.name, "env": env_row.name })),
    )
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
    logics: Option<std::collections::HashMap<String, String>>,
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

#[derive(Deserialize)]
struct SchemaSnapshotRequest {
    project: String,
    env: String,
}

#[derive(Serialize)]
struct SchemaSnapshotResponse {
    project: String,
    env: String,
    snapshots: Vec<SchemaSnapshotEntry>,
}

#[derive(Serialize)]
struct SchemaDriftResponse {
    project: String,
    env: String,
    drift: Vec<SchemaDriftEntry>,
}

#[derive(Serialize)]
struct SchemaDriftEntry {
    connection: String,
    issues: Vec<String>,
}

#[derive(Serialize)]
struct SchemaSnapshotEntry {
    connection: String,
    snapshot: SchemaSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SchemaSnapshot {
    tables: Vec<SnapshotTable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotTable {
    name: String,
    columns: Vec<SnapshotColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotColumn {
    name: String,
    data_type: String,
    nullable: bool,
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
    let operator = require_auth(&headers, &state).await?;
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
    let logics = req.logics.clone().unwrap_or_default();

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

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

            if !req.dry_run {
                let current_snapshot = introspect_postgres(&db_url)
                    .await
                    .map_err(|e| HubError::BadRequest(e))?;
                let snapshot_json = serde_json::to_string(&current_snapshot)
                    .map_err(|e| HubError::Internal(e.to_string()))?;
                db.insert_schema_snapshot(&project_row.id, &env_row.id, &conn.name, &snapshot_json)
                    .await
                    .map_err(|e| HubError::Internal(e.to_string()))?;
            }
        }
    }

    if only.release && !req.dry_run {
        let connections = db
            .list_connections(&project_row.id, &env_row.id)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;

        for conn in connections {
            if conn.engine != "postgres" {
                continue;
            }
            let db_url = db
                .decrypt_db_url(&conn)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
            let current_snapshot = introspect_postgres(&db_url)
                .await
                .map_err(|e| HubError::BadRequest(e))?;
            if let Some(latest) = db
                .get_latest_snapshot(&project_row.id, &env_row.id, &conn.name)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?
            {
                let issues = compare_snapshots(&latest, &current_snapshot);
                if !issues.is_empty() {
                    return Err(HubError::BadRequest(format!(
                        "Drift detected in {}: {}",
                        conn.name,
                        issues.join(", ")
                    )));
                }
            } else {
                let snapshot_json = serde_json::to_string(&current_snapshot)
                    .map_err(|e| HubError::Internal(e.to_string()))?;
                db.insert_schema_snapshot(&project_row.id, &env_row.id, &conn.name, &snapshot_json)
                    .await
                    .map_err(|e| HubError::Internal(e.to_string()))?;
            }
        }
    }

    let mut release_id = None;
    let mut reused = false;

    if only.release && !req.dry_run {
        let snapshot_hash = compute_snapshot_hash(&schema, &permissions, &storage, &logics, &req.r#ref)
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
                    &logics,
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

    db.insert_audit_log(
        &operator.id,
        "release.apply",
        "release",
        release_id.as_deref(),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({
            "project": project_row.name,
            "env": env_row.name,
            "ref": req.r#ref,
            "dry_run": req.dry_run,
            "reused": reused,
        })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

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

async fn schema_snapshot(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<SchemaSnapshotRequest>,
) -> Result<Json<SchemaSnapshotResponse>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let connections = db
        .list_connections(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let mut snapshots = Vec::new();
    for conn in connections {
        if conn.engine != "postgres" {
            continue;
        }
        let db_url = db
            .decrypt_db_url(&conn)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        let snapshot = introspect_postgres(&db_url)
            .await
            .map_err(|e| HubError::BadRequest(e))?;
        let snapshot_json = serde_json::to_string(&snapshot)
            .map_err(|e| HubError::Internal(e.to_string()))?;
        db.insert_schema_snapshot(&project_row.id, &env_row.id, &conn.name, &snapshot_json)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        snapshots.push(SchemaSnapshotEntry {
            connection: conn.name,
            snapshot,
        });
    }

    db.insert_audit_log(
        &operator.id,
        "schema.snapshot",
        "schema_snapshot",
        None,
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({ "project": project_row.name, "env": env_row.name })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(SchemaSnapshotResponse {
        project: req.project,
        env: req.env,
        snapshots,
    }))
}

async fn schema_drift(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<SchemaSnapshotRequest>,
) -> Result<Json<SchemaDriftResponse>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let connections = db
        .list_connections(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let mut drift = Vec::new();
    for conn in connections {
        if conn.engine != "postgres" {
            continue;
        }
        let db_url = db
            .decrypt_db_url(&conn)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
        let current = introspect_postgres(&db_url)
            .await
            .map_err(|e| HubError::BadRequest(e))?;
        let latest = db
            .get_latest_snapshot(&project_row.id, &env_row.id, &conn.name)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;

        let issues = if let Some(snapshot) = latest {
            compare_snapshots(&snapshot, &current)
        } else {
            vec!["no snapshot available".to_string()]
        };
        drift.push(SchemaDriftEntry {
            connection: conn.name,
            issues,
        });
    }

    Ok(Json(SchemaDriftResponse {
        project: req.project,
        env: req.env,
        drift,
    }))
}

#[derive(Deserialize)]
struct AuditLogQuery {
    project: Option<String>,
    env: Option<String>,
    operator_id: Option<String>,
    action: Option<String>,
    resource_type: Option<String>,
    limit: Option<usize>,
}

async fn list_audit_logs(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<AuditLogQuery>,
) -> Result<Json<Vec<serde_json::Value>>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    if query.env.is_some() && query.project.is_none() {
        return Err(HubError::BadRequest(
            "project is required when env is provided".to_string(),
        ));
    }

    let (project_id, env_id) = if let Some(project) = &query.project {
        let project_row = db
            .get_project_by_name(project)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
            .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;
        require_project_role(&db, &operator.id, &project_row.id, "member").await?;

        let env_id = if let Some(env) = &query.env {
            let env_row = db
                .get_env(&project_row.id, env)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?
                .ok_or_else(|| HubError::NotFound("Env not found".to_string()))?;
            Some(env_row.id)
        } else {
            None
        };

        (Some(project_row.id), env_id)
    } else {
        require_owner(&operator)?;
        (None, None)
    };

    let limit = query.limit.unwrap_or(100).min(500);
    let rows = db
        .query_audit_logs(
            project_id.as_deref(),
            env_id.as_deref(),
            query.operator_id.as_deref(),
            query.action.as_deref(),
            query.resource_type.as_deref(),
            limit,
        )
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let list = rows
        .into_iter()
        .map(|row| {
            let metadata = row
                .metadata_json
                .as_ref()
                .and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok());
            serde_json::json!({
                "id": row.id,
                "operator_id": row.operator_id,
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "project_id": row.project_id,
                "env_id": row.env_id,
                "metadata": metadata,
                "created_at": row.created_at,
            })
        })
        .collect();

    Ok(Json(list))
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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let release = state
        .db
        .get_release(&id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Release not found".to_string()))?;
    require_project_role(&state.db, &operator.id, &release.project_id, "member").await?;

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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let project_row = db
        .get_project_by_name(&req.project)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Project not found".to_string()))?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let from_env = req.from.clone();
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

    let release = db
        .get_release(&release_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("Release not found".to_string()))?;
    let schema = release.schema().map_err(|e| HubError::Internal(e.to_string()))?;
    let connections = db
        .list_connections(&project_row.id, &to_env.id)
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

        let current_snapshot = introspect_postgres(&db_url)
            .await
            .map_err(|e| HubError::BadRequest(e))?;
        if let Some(latest) = db
            .get_latest_snapshot(&project_row.id, &to_env.id, &conn.name)
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?
        {
            let issues = compare_snapshots(&latest, &current_snapshot);
            if !issues.is_empty() {
                return Err(HubError::BadRequest(format!(
                    "Drift detected in {}: {}",
                    conn.name,
                    issues.join(", ")
                )));
            }
        }

        apply_schema_to_postgres(&db_url, schema_ir, true, false)
            .await
            .map_err(|e| HubError::BadRequest(e))?;
    }

    db.set_current_release(&project_row.id, &to_env.id, &release_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "release.promote",
        "release",
        Some(&release_id),
        Some(&project_row.id),
        Some(&to_env.id),
        Some(serde_json::json!({
            "project": project_row.name,
            "to_env": to_env.name,
            "from_env": from_env,
        })),
    )
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
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();

    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    db.set_current_release(&project_row.id, &env_row.id, &req.to_release_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "release.rollback",
        "release",
        Some(&req.to_release_id),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({ "project": project_row.name, "env": env_row.name })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true, "release_id": req.to_release_id })))
}

#[derive(Deserialize)]
struct OidcProviderRequest {
    project: String,
    env: String,
    name: String,
    issuer: String,
    auth_url: String,
    token_url: String,
    userinfo_url: Option<String>,
    client_id: String,
    client_secret: String,
    redirect_uris: Vec<String>,
}

#[derive(Serialize)]
struct OidcProviderResponse {
    name: String,
    issuer: String,
    auth_url: String,
    token_url: String,
    userinfo_url: Option<String>,
    client_id: String,
    redirect_uris: Vec<String>,
}

async fn set_oidc_provider(
    State(state): State<HubState>,
    headers: HeaderMap,
    Json(req): Json<OidcProviderRequest>,
) -> Result<Json<OidcProviderResponse>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &req.project, &req.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let provider = db
        .upsert_oidc_provider(
            &project_row.id,
            &env_row.id,
            &req.name,
            &req.issuer,
            &req.auth_url,
            &req.token_url,
            req.userinfo_url.as_deref(),
            &req.client_id,
            &req.client_secret,
            &req.redirect_uris,
        )
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    db.insert_audit_log(
        &operator.id,
        "oidc.provider.set",
        "oidc_provider",
        Some(&provider.id),
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({ "project": project_row.name, "env": env_row.name, "name": provider.name })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    let redirects = provider
        .redirect_uris()
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(OidcProviderResponse {
        name: provider.name,
        issuer: provider.issuer,
        auth_url: provider.auth_url,
        token_url: provider.token_url,
        userinfo_url: provider.userinfo_url,
        client_id: provider.client_id,
        redirect_uris: redirects,
    }))
}

#[derive(Deserialize)]
struct OidcProviderQuery {
    project: String,
    env: String,
}

async fn list_oidc_providers(
    State(state): State<HubState>,
    headers: HeaderMap,
    Query(query): Query<OidcProviderQuery>,
) -> Result<Json<Vec<OidcProviderResponse>>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "member").await?;

    let providers = db
        .list_oidc_providers(&project_row.id, &env_row.id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let list = providers
        .into_iter()
        .map(|p| {
            let redirects = p.redirect_uris().unwrap_or_default();
            OidcProviderResponse {
                name: p.name,
                issuer: p.issuer,
                auth_url: p.auth_url,
                token_url: p.token_url,
                userinfo_url: p.userinfo_url,
                client_id: p.client_id,
                redirect_uris: redirects,
            }
        })
        .collect();

    Ok(Json(list))
}

async fn delete_oidc_provider(
    State(state): State<HubState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<OidcProviderQuery>,
) -> Result<Json<serde_json::Value>> {
    let operator = require_auth(&headers, &state).await?;
    let db = state.db.clone();
    let (project_row, env_row) = resolve_project_env(&db, &query.project, &query.env).await?;
    require_project_role(&db, &operator.id, &project_row.id, "admin").await?;

    let deleted = db
        .delete_oidc_provider(&project_row.id, &env_row.id, &name)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    if !deleted {
        return Err(HubError::NotFound("OIDC provider not found".to_string()));
    }

    db.insert_audit_log(
        &operator.id,
        "oidc.provider.delete",
        "oidc_provider",
        None,
        Some(&project_row.id),
        Some(&env_row.id),
        Some(serde_json::json!({ "project": project_row.name, "env": env_row.name, "name": name })),
    )
    .await
    .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct OidcStartQuery {
    redirect: String,
}

async fn oidc_start(
    State(state): State<HubState>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    Query(query): Query<OidcStartQuery>,
) -> Result<Redirect> {
    let db = state.db.clone();
    let (project, env) = resolve_project_env_from_headers(&headers)?;
    let (project_row, env_row) = resolve_project_env(&db, &project, &env).await?;

    let provider_row = db
        .get_oidc_provider(&project_row.id, &env_row.id, &provider)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("OIDC provider not found".to_string()))?;

    let redirects = provider_row
        .redirect_uris()
        .map_err(|e| HubError::Internal(e.to_string()))?;
    if !redirects.iter().any(|r| r == &query.redirect) {
        return Err(HubError::BadRequest("Redirect URI not allowed".to_string()));
    }

    let state_token = new_secret();
    db.insert_oidc_session(&state_token, &project_row.id, &env_row.id, &provider, &query.redirect)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let redirect_uri = oidc_callback_url(&provider);
    let mut url = Url::parse(&provider_row.auth_url)
        .map_err(|e| HubError::BadRequest(e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("client_id", &provider_row.client_id)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("state", &state_token);

    Ok(Redirect::temporary(url.as_str()))
}

#[derive(Deserialize)]
struct OidcCallbackQuery {
    code: String,
    state: String,
}

async fn oidc_callback(
    State(state): State<HubState>,
    Path(provider): Path<String>,
    Query(query): Query<OidcCallbackQuery>,
) -> Result<Response> {
    let db = state.db.clone();
    let session = db
        .take_oidc_session(&query.state)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::BadRequest("Invalid OIDC state".to_string()))?;

    let provider_row = db
        .get_oidc_provider(&session.project_id, &session.env_id, &provider)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::NotFound("OIDC provider not found".to_string()))?;

    let redirect_uri = oidc_callback_url(&provider);
    let token = exchange_oidc_code(&provider_row, &query.code, &redirect_uri).await?;
    let claims = verify_oidc_id_token(&provider_row, &token.id_token).await?;

    let subject = claims
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or_else(|| HubError::BadRequest("OIDC token missing sub".to_string()))?
        .to_string();
    let email_claim = claims
        .get("email")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let fallback_email = email_claim
        .clone()
        .unwrap_or_else(|| subject.clone());

    let roles = extract_roles(&claims);

    let end_user = if let Some(existing) = db
        .get_end_user_by_identity(&session.project_id, &session.env_id, &provider, &subject)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
    {
        existing
    } else {
        if let Some(email) = email_claim {
            if let Some(existing) = db
                .get_end_user(&session.project_id, &session.env_id, &email)
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?
            {
                db.link_end_user_identity(
                    &existing.id,
                    &session.project_id,
                    &session.env_id,
                    &provider,
                    &subject,
                )
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
                existing
            } else {
                let password = new_secret();
                let hash = hash_password(&password)?;
                let row = db
                    .create_end_user(&session.project_id, &session.env_id, &email, &hash, &roles)
                    .await
                    .map_err(|e| HubError::Internal(e.to_string()))?;
                db.link_end_user_identity(
                    &row.id,
                    &session.project_id,
                    &session.env_id,
                    &provider,
                    &subject,
                )
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
                row
            }
        } else {
            let password = new_secret();
            let hash = hash_password(&password)?;
            let row = db
                .create_end_user(
                    &session.project_id,
                    &session.env_id,
                    &fallback_email,
                    &hash,
                    &roles,
                )
                .await
                .map_err(|e| HubError::Internal(e.to_string()))?;
            db.link_end_user_identity(
                &row.id,
                &session.project_id,
                &session.env_id,
                &provider,
                &subject,
            )
            .await
            .map_err(|e| HubError::Internal(e.to_string()))?;
            row
        }
    };

    let ttl_seconds = access_token_ttl_seconds();

    let project_name = db
        .get_project_by_id(&session.project_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .map(|p| p.name)
        .unwrap_or_else(|| session.project_id.clone());
    let env_name = db
        .get_env_by_id(&session.env_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .map(|e| e.name)
        .unwrap_or_else(|| session.env_id.clone());

    let access_token = issue_access_token(
        &state.paseto_keys,
        &end_user.id,
        &project_name,
        &env_name,
        &end_user.roles,
        ttl_seconds,
    )?;
    let refresh = issue_refresh_token(&db, &end_user.id, &session.project_id, &session.env_id)
        .await?;

    let access_cookie = cookie_name("stk_access", &project_name, &env_name);
    let refresh_cookie = cookie_name("stk_refresh", &project_name, &env_name);

    let mut redirect_url = Url::parse(&session.redirect_uri)
        .map_err(|e| HubError::BadRequest(e.to_string()))?;
    redirect_url.query_pairs_mut().append_pair("status", "ok");

    let mut response = Redirect::temporary(redirect_url.as_str()).into_response();
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&access_cookie, &access_token, ttl_seconds))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&refresh_cookie, &refresh.token, 60 * 60 * 24 * 30))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );

    Ok(response)
}

#[derive(Serialize)]
struct InternalReleaseResponse {
    release_id: String,
    schema: ProjectSchema,
    permissions: PermissionPolicy,
    storage: StorageConfig,
    logics: std::collections::HashMap<String, String>,
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
    let logics = release.logics().map_err(|e| HubError::Internal(e.to_string()))?;

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
        logics,
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

    let mut key = row.into_api_key().map_err(|e| HubError::Internal(e.to_string()))?;
    if let Some(project) = db
        .get_project_by_id(&key.project_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
    {
        key.project_name = Some(project.name);
    }
    if let Some(env) = db
        .get_env_by_id(&key.env_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
    {
        key.env_name = Some(env.name);
    }
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
) -> Result<Response> {
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

    let ttl_seconds = access_token_ttl_seconds();

    let token = issue_access_token(
        &state.paseto_keys,
        &end_user.id,
        &req.project,
        &req.env,
        &end_user.roles,
        ttl_seconds,
    )?;

    let refresh = issue_refresh_token(&db, &end_user.id, &project_row.id, &env_row.id)
        .await?;

    let body = EndUserAuthResponse {
        access_token: token,
        refresh_token: refresh.token,
        expires_in: ttl_seconds,
    };

    let access_cookie = cookie_name("stk_access", &req.project, &req.env);
    let refresh_cookie = cookie_name("stk_refresh", &req.project, &req.env);
    let access_value = body.access_token.clone();
    let refresh_value = body.refresh_token.clone();

    let mut response = Json(body).into_response();
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&access_cookie, &access_value, ttl_seconds))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&refresh_cookie, &refresh_value, 60 * 60 * 24 * 30))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );

    Ok(response)
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
) -> Result<Response> {
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

    let ttl_seconds = access_token_ttl_seconds();

    let token = issue_access_token(
        &state.paseto_keys,
        &end_user.id,
        &req.project,
        &req.env,
        &end_user.roles,
        ttl_seconds,
    )?;

    let body = EndUserAuthResponse {
        access_token: token,
        refresh_token: req.refresh_token,
        expires_in: ttl_seconds,
    };

    let access_cookie = cookie_name("stk_access", &req.project, &req.env);
    let refresh_cookie = cookie_name("stk_refresh", &req.project, &req.env);
    let access_value = body.access_token.clone();
    let refresh_value = body.refresh_token.clone();
    let mut response = Json(body).into_response();
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&access_cookie, &access_value, ttl_seconds))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_cookie(&refresh_cookie, &refresh_value, 60 * 60 * 24 * 30))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );

    Ok(response)
}

#[derive(Deserialize)]
struct EndUserLogoutRequest {
    project: String,
    env: String,
    refresh_token: String,
}

async fn enduser_logout(
    State(state): State<HubState>,
    Json(req): Json<EndUserLogoutRequest>,
) -> Result<Response> {
    let db = state.db.clone();

    let (token_id, _) = parse_refresh_token(&req.refresh_token)
        .ok_or_else(|| HubError::Unauthorized("Invalid refresh token".to_string()))?;

    db.revoke_refresh_token(&token_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let access_cookie = cookie_name("stk_access", &req.project, &req.env);
    let refresh_cookie = cookie_name("stk_refresh", &req.project, &req.env);
    let mut response = Json(serde_json::json!({ "ok": true })).into_response();
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_clear_cookie(&access_cookie))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(&build_clear_cookie(&refresh_cookie))
            .map_err(|e| HubError::Internal(e.to_string()))?,
    );
    Ok(response)
}

fn issue_access_token(
    keys: &[PasetoKey],
    user_id: &str,
    project: &str,
    env: &str,
    roles: &[String],
    ttl_seconds: i64,
) -> Result<String> {
    let key = keys
        .first()
        .ok_or_else(|| HubError::Internal("No PASETO keys configured".to_string()))?;

    let now = Utc::now();
    let exp = now + Duration::seconds(ttl_seconds);
    let jti = ulid::Ulid::new().to_string();

    let footer_json = key
        .kid
        .as_ref()
        .map(|kid| serde_json::json!({ "kid": kid }).to_string());

    let paseto_key = PasetoSymmetricKey::<V4, Local>::from(Key::from(key.key));
    let mut builder = PasetoBuilder::<V4, Local>::default();
    if let Some(ref footer) = footer_json {
        builder.set_footer(Footer::from(footer.as_str()));
    }

    let token = builder
        .set_claim(SubjectClaim::from(user_id))
        .set_claim(IssuedAtClaim::try_from(now.to_rfc3339()).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(ExpirationClaim::try_from(exp.to_rfc3339()).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(TokenIdentifierClaim::from(jti.as_str()))
        .set_claim(CustomClaim::try_from(("project_id", project)).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(CustomClaim::try_from(("env_id", env)).map_err(|e| HubError::Internal(e.to_string()))?)
        .set_claim(CustomClaim::try_from(("roles", roles.to_vec())).map_err(|e| HubError::Internal(e.to_string()))?)
        .build(&paseto_key)
        .map_err(|e| HubError::Internal(e.to_string()))?;

    Ok(token)
}

fn access_token_ttl_seconds() -> i64 {
    let configured = std::env::var("STK_ACCESS_TTL")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(300);
    configured.clamp(60, 900)
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
        "id": r.id,
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

fn role_rank(role: &str) -> u8 {
    match role {
        "owner" => 3,
        "admin" => 2,
        "member" => 1,
        _ => 0,
    }
}

async fn require_project_role(
    db: &HubDb,
    operator_id: &str,
    project_id: &str,
    min_role: &str,
) -> Result<()> {
    let role = db
        .operator_role_for_project(operator_id, project_id)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .ok_or_else(|| HubError::Forbidden("No project access".to_string()))?;

    if role_rank(&role) < role_rank(min_role) {
        return Err(HubError::Forbidden("Insufficient role".to_string()));
    }
    Ok(())
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

        let rows: Vec<(String, String, bool, Option<String>)> = sqlx::query_as(
            r#"SELECT a.attname,
                      format_type(a.atttypid, a.atttypmod) AS data_type,
                      a.attnotnull,
                      pg_get_expr(ad.adbin, ad.adrelid) AS column_default
               FROM pg_attribute a
               JOIN pg_class c ON a.attrelid = c.oid
               JOIN pg_namespace n ON c.relnamespace = n.oid
               LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
               WHERE n.nspname = 'public'
                 AND c.relname = $1
                 AND a.attnum > 0
                 AND NOT a.attisdropped"#,
        )
        .bind(&table.name)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut existing_map = std::collections::HashMap::new();
        for (name, data_type, not_null, default_expr) in rows {
            existing_map.insert(
                name.clone(),
                ExistingColumnInfo {
                    data_type,
                    nullable: !not_null,
                    default_expr,
                },
            );
        }
        let mut existing_columns: HashSet<String> = existing_map.keys().cloned().collect();

        for column in table.columns.iter().map(|c| &c.name).chain(std::iter::once(&table.id.name)) {
            if let Some(info) = existing_map.get(column) {
                existing_columns.remove(column);

                if column == &table.id.name {
                    continue;
                }

                if let Some(col) = table.find_column(column) {
                    let desired_type = normalize_pg_type(&col.column_type.to_postgres_type());
                    let actual_type = normalize_pg_type(&info.data_type);
                    if desired_type != actual_type {
                        let ddl = format!(
                            "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" TYPE {};",
                            table.name,
                            col.name,
                            col.column_type.to_postgres_type()
                        );
                        plan.push(format!("alter column {}.{} type", table.name, col.name));
                        if !dry_run {
                            sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                        }
                    }

                    if info.nullable != col.nullable {
                        let ddl = if col.nullable {
                            format!(
                                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP NOT NULL;",
                                table.name, col.name
                            )
                        } else {
                            format!(
                                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET NOT NULL;",
                                table.name, col.name
                            )
                        };
                        plan.push(format!("alter column {}.{} nullability", table.name, col.name));
                        if !dry_run {
                            sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                        }
                    }

                    let desired_default = col.default.as_deref().map(desired_default_expr);
                    let actual_default = info
                        .default_expr
                        .as_deref()
                        .map(normalize_default_expr);
                    if desired_default != actual_default {
                        let ddl = if let Some(default_expr) = desired_default {
                            format!(
                                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET DEFAULT {};",
                                table.name, col.name, default_expr
                            )
                        } else {
                            format!(
                                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP DEFAULT;",
                                table.name, col.name
                            )
                        };
                        plan.push(format!("alter column {}.{} default", table.name, col.name));
                        if !dry_run {
                            sqlx::query(&ddl).execute(&pool).await.map_err(|e| e.to_string())?;
                        }
                    }
                }
                continue;
            }

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

#[derive(Debug)]
struct ExistingColumnInfo {
    data_type: String,
    nullable: bool,
    default_expr: Option<String>,
}

fn normalize_pg_type(data_type: &str) -> String {
    match data_type.trim().to_lowercase().as_str() {
        "character varying" | "varchar" => "text".to_string(),
        "timestamp with time zone" | "timestamptz" => "timestamptz".to_string(),
        "timestamp without time zone" => "timestamp".to_string(),
        "double precision" => "double precision".to_string(),
        other => other.to_string(),
    }
}

fn desired_default_expr(default: &str) -> String {
    match default {
        "now" | "now()" => "NOW()".to_string(),
        "true" => "TRUE".to_string(),
        "false" => "FALSE".to_string(),
        s if s.starts_with('\'') => s.to_string(),
        s if s.parse::<i64>().is_ok() => s.to_string(),
        s if s.parse::<f64>().is_ok() => s.to_string(),
        s => format!("'{}'", s.replace('\'', "''")),
    }
}

fn normalize_default_expr(default: &str) -> String {
    let mut s = default.trim().to_string();
    if s.starts_with('(') && s.ends_with(')') && s.len() > 1 {
        s = s[1..s.len() - 1].to_string();
    }
    if let Some((expr, _)) = s.split_once("::") {
        return expr.trim().to_string();
    }
    s
}

async fn introspect_postgres(db_url: &str) -> std::result::Result<SchemaSnapshot, String> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(db_url)
        .await
        .map_err(|e| format!("DB connect failed: {}", e))?;

    let rows = sqlx::query(
        r#"SELECT table_name, column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'public'
           ORDER BY table_name, ordinal_position"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tables: std::collections::BTreeMap<String, Vec<SnapshotColumn>> = std::collections::BTreeMap::new();
    for row in rows {
        let table_name: String = row.try_get("table_name").map_err(|e| e.to_string())?;
        let column_name: String = row.try_get("column_name").map_err(|e| e.to_string())?;
        let data_type: String = row.try_get("data_type").map_err(|e| e.to_string())?;
        let is_nullable: String = row.try_get("is_nullable").map_err(|e| e.to_string())?;
        let nullable = is_nullable.eq_ignore_ascii_case("yes");

        tables
            .entry(table_name)
            .or_default()
            .push(SnapshotColumn {
                name: column_name,
                data_type,
                nullable,
            });
    }

    let table_list = tables
        .into_iter()
        .map(|(name, columns)| SnapshotTable { name, columns })
        .collect::<Vec<_>>();

    Ok(SchemaSnapshot { tables: table_list })
}

fn compare_snapshots(old: &db::SchemaSnapshotRow, current: &SchemaSnapshot) -> Vec<String> {
    let mut issues = Vec::new();
    let parsed: SchemaSnapshot = match serde_json::from_str(&old.snapshot_json) {
        Ok(v) => v,
        Err(_) => return vec!["invalid snapshot data".to_string()],
    };

    let old_tables = parsed
        .tables
        .iter()
        .map(|t| (t.name.clone(), t.columns.iter().map(|c| c.name.clone()).collect::<std::collections::HashSet<_>>()))
        .collect::<std::collections::HashMap<_, _>>();
    let new_tables = current
        .tables
        .iter()
        .map(|t| (t.name.clone(), t.columns.iter().map(|c| c.name.clone()).collect::<std::collections::HashSet<_>>()))
        .collect::<std::collections::HashMap<_, _>>();

    for (table, cols) in &old_tables {
        if let Some(new_cols) = new_tables.get(table) {
            for col in cols {
                if !new_cols.contains(col) {
                    issues.push(format!("missing column {}.{}", table, col));
                }
            }
        } else {
            issues.push(format!("missing table {}", table));
        }
    }

    for (table, cols) in &new_tables {
        if !old_tables.contains_key(table) {
            issues.push(format!("extra table {}", table));
        } else if let Some(old_cols) = old_tables.get(table) {
            for col in cols {
                if !old_cols.contains(col) {
                    issues.push(format!("extra column {}.{}", table, col));
                }
            }
        }
    }

    issues
}

fn oidc_callback_url(provider: &str) -> String {
    let base = std::env::var("STK_HUB_PUBLIC_URL")
        .unwrap_or_else(|_| "http://localhost:4000".to_string());
    format!("{}/oidc/{}/callback", base.trim_end_matches('/'), provider)
}

fn resolve_project_env_from_headers(headers: &HeaderMap) -> Result<(String, String)> {
    let project = header_string(headers, "x-santokit-project")
        .ok_or_else(|| HubError::BadRequest("Missing project".to_string()))?;
    let env =
        header_string(headers, "x-santokit-env").ok_or_else(|| HubError::BadRequest("Missing env".to_string()))?;
    Ok((project, env))
}

fn header_string(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string())
}

#[derive(Deserialize)]
struct OidcDiscovery {
    jwks_uri: String,
}

#[derive(Deserialize)]
struct OidcTokenResponse {
    id_token: String,
    #[allow(dead_code)]
    access_token: Option<String>,
}

async fn exchange_oidc_code(
    provider: &db::OidcProviderRow,
    code: &str,
    redirect_uri: &str,
) -> Result<OidcTokenResponse> {
    let client = reqwest::Client::new();
    let resp = client
        .post(&provider.token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("client_id", provider.client_id.as_str()),
            ("client_secret", provider.client_secret.as_str()),
        ])
        .send()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(HubError::BadRequest("OIDC token exchange failed".to_string()));
    }

    let token: OidcTokenResponse = resp
        .json()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;
    Ok(token)
}

async fn verify_oidc_id_token(
    provider: &db::OidcProviderRow,
    id_token: &str,
) -> Result<serde_json::Value> {
    let issuer = provider.issuer.trim_end_matches('/');
    let discovery_url = format!("{}/.well-known/openid-configuration", issuer);
    let discovery: OidcDiscovery = reqwest::get(&discovery_url)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let jwks: JwkSet = reqwest::get(&discovery.jwks_uri)
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?
        .json()
        .await
        .map_err(|e| HubError::Internal(e.to_string()))?;

    let header = decode_header(id_token).map_err(|e| HubError::BadRequest(e.to_string()))?;
    let kid = header.kid.ok_or_else(|| HubError::BadRequest("OIDC token missing kid".to_string()))?;
    let jwk = jwks
        .keys
        .iter()
        .find(|k| k.common.key_id.as_deref() == Some(&kid))
        .ok_or_else(|| HubError::BadRequest("OIDC key not found".to_string()))?;

    let decoding_key = DecodingKey::from_jwk(jwk).map_err(|e| HubError::BadRequest(e.to_string()))?;
    let mut validation = Validation::new(header.alg);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[provider.client_id.as_str()]);

    let token = decode::<serde_json::Value>(id_token, &decoding_key, &validation)
        .map_err(|e| HubError::BadRequest(e.to_string()))?;
    Ok(token.claims)
}

fn extract_roles(claims: &serde_json::Value) -> Vec<String> {
    if let Some(arr) = claims.get("roles").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
    }
    if let Some(role) = claims.get("role").and_then(|v| v.as_str()) {
        return vec![role.to_string()];
    }
    vec!["user".to_string()]
}
