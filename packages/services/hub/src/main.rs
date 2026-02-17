use std::collections::HashMap;
use std::path::Path as FsPath;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use sea_orm::{
    ColumnTrait, Condition, ConnectionTrait, Database, DatabaseConnection, DbBackend, EntityTrait,
    QueryFilter, QueryOrder, QuerySelect, Set, Statement,
};
use sea_query::OnConflict;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

mod entities;
use entities::prelude::*;

#[derive(Clone)]
struct AppState {
    db: DatabaseConnection,
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorInner,
}

#[derive(Serialize)]
struct ErrorInner {
    code: &'static str,
    message: String,
    requestId: String,
}

fn err(
    status: StatusCode,
    code: &'static str,
    message: impl Into<String>,
) -> (StatusCode, Json<ErrorBody>) {
    (
        status,
        Json(ErrorBody {
            error: ErrorInner {
                code,
                message: message.into(),
                requestId: Uuid::new_v4().to_string(),
            },
        }),
    )
}

fn require_operator(headers: &HeaderMap) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    if token == Some("operator-token") {
        Ok(())
    } else {
        Err(err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "operator auth required",
        ))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db_url =
        std::env::var("STK_HUB_DB_URL").unwrap_or_else(|_| "sqlite:///data/hub.db".to_string());
    let port: u16 = std::env::var("STK_HUB_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4000);

    if let Some(path) = db_url.strip_prefix("sqlite:///") {
        let abs_path = FsPath::new("/").join(path);
        if let Some(parent) = abs_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
    } else if let Some(path) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = FsPath::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
    }
    let connect_url = if let Some(path) = db_url.strip_prefix("sqlite:///") {
        let path = format!("/{}", path.trim_start_matches('/'));
        format!("sqlite:{}?mode=rwc", path)
    } else if let Some(path) = db_url.strip_prefix("sqlite://") {
        format!("sqlite://{}?mode=rwc", path)
    } else if db_url.starts_with("sqlite:") {
        if db_url.contains("?") {
            format!("{}&mode=rwc", db_url)
        } else {
            format!("{}?mode=rwc", db_url)
        }
    } else {
        db_url.clone()
    };
    let db = Database::connect(&connect_url).await?;
    init_db(&db).await?;

    let state = Arc::new(AppState { db });
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/auth/login", post(operator_login))
        .route("/api/projects", post(project_create))
        .route("/api/envs", post(env_create))
        .route("/api/connections/set", post(connection_set))
        .route("/api/connections/test", post(connection_test))
        .route("/api/apply", post(apply_release))
        .route("/api/apikeys/create", post(apikey_create))
        .route("/api/apikeys/list", get(apikey_list))
        .route("/api/apikeys/revoke", post(apikey_revoke))
        .route("/api/endusers/signup", post(enduser_signup))
        .route("/api/endusers/login", post(enduser_login))
        .route("/api/oidc/providers", post(oidc_create))
        .route("/api/releases", get(release_list))
        .route("/api/releases/promote", post(release_promote))
        .route("/api/releases/rollback", post(release_rollback))
        .route("/internal/apikeys/verify", post(internal_apikey_verify))
        .route("/internal/tokens/verify", post(internal_token_verify))
        .route(
            "/internal/releases/{project}/{env}/current",
            get(internal_current_release),
        )
        .route(
            "/internal/releases/latest/current",
            get(internal_latest_release),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn init_db(db: &DatabaseConnection) -> anyhow::Result<()> {
    let stmts = [
        "CREATE TABLE IF NOT EXISTS projects (name TEXT PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS envs (project TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(project,name))",
        "CREATE TABLE IF NOT EXISTS connections (project TEXT NOT NULL, env TEXT NOT NULL, name TEXT NOT NULL, engine TEXT NOT NULL, db_url TEXT NOT NULL, PRIMARY KEY(project,env,name))",
        "CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, project TEXT NOT NULL, env TEXT NOT NULL, ref TEXT NOT NULL, schema_json TEXT NOT NULL, permissions_yaml TEXT NOT NULL, storage_yaml TEXT NOT NULL, logics_json TEXT NOT NULL, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS current_releases (project TEXT NOT NULL, env TEXT NOT NULL, release_id TEXT NOT NULL, PRIMARY KEY(project,env))",
        "CREATE TABLE IF NOT EXISTS apikeys (id TEXT PRIMARY KEY, name TEXT NOT NULL, project TEXT NOT NULL, env TEXT NOT NULL, secret TEXT NOT NULL, roles_json TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS endusers (project TEXT NOT NULL, env TEXT NOT NULL, email TEXT NOT NULL, password TEXT NOT NULL, sub TEXT NOT NULL, PRIMARY KEY(project,env,email))",
        "CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, project TEXT NOT NULL, env TEXT NOT NULL, sub TEXT NOT NULL, roles_json TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS oidc_providers (project TEXT NOT NULL, env TEXT NOT NULL, name TEXT NOT NULL, issuer TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(project,env,name))",
    ];
    for s in stmts {
        db.execute(Statement::from_string(DbBackend::Sqlite, s.to_string()))
            .await?;
    }
    Ok(())
}

async fn health() -> Json<Value> {
    Json(serde_json::json!({"ok": true}))
}

#[derive(Deserialize)]
struct OperatorLoginReq {
    email: String,
    password: String,
}

async fn operator_login(
    Json(req): Json<OperatorLoginReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    if req.email == "owner@example.com" && req.password == "password" {
        Ok(Json(serde_json::json!({"token":"operator-token"})))
    } else {
        Err(err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "invalid operator credentials",
        ))
    }
}

#[derive(Deserialize)]
struct ProjectReq {
    project: String,
}

async fn project_create(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ProjectReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    Project::insert(entities::project::ActiveModel {
        name: Set(req.project),
    })
    .on_conflict(OnConflict::column(entities::project::Column::Name).do_nothing().to_owned())
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct EnvReq {
    project: String,
    env: String,
}

async fn env_create(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<EnvReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    Env::insert(entities::env::ActiveModel {
        project: Set(req.project),
        name: Set(req.env),
    })
    .on_conflict(
        OnConflict::columns([entities::env::Column::Project, entities::env::Column::Name])
            .do_nothing()
            .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct ConnectionSetReq {
    project: String,
    env: String,
    name: String,
    engine: String,
    db_url: String,
}

async fn connection_set(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ConnectionSetReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    Connection::insert(entities::connection::ActiveModel {
        project: Set(req.project),
        env: Set(req.env),
        name: Set(req.name),
        engine: Set(req.engine),
        db_url: Set(req.db_url),
    })
    .on_conflict(
        OnConflict::columns([
            entities::connection::Column::Project,
            entities::connection::Column::Env,
            entities::connection::Column::Name,
        ])
        .update_columns([
            entities::connection::Column::Engine,
            entities::connection::Column::DbUrl,
        ])
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct ConnectionTestReq {
    project: String,
    env: String,
    name: String,
}

async fn connection_test(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ConnectionTestReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let row = Connection::find()
        .filter(entities::connection::Column::Project.eq(req.project))
        .filter(entities::connection::Column::Env.eq(req.env))
        .filter(entities::connection::Column::Name.eq(req.name))
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "connection not found"))?;
    let db_url = row.db_url;
    if Database::connect(&db_url).await.is_err() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "connection failed",
        ));
    }
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct ApplyReq {
    project: String,
    env: String,
    r#ref: String,
    schema: Vec<String>,
    permissions: Option<String>,
    storage: Option<String>,
    logics: Option<HashMap<String, String>>,
}

async fn apply_release(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ApplyReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let schema_json = merge_schema(&req.schema)?;
    apply_schema_to_db(&state.db, &req.project, &req.env, &schema_json).await?;

    let permissions = req
        .permissions
        .unwrap_or_else(|| "tables: {}\n".to_string());
    let storage = req.storage.unwrap_or_else(|| "{}\n".to_string());
    let logics = serde_json::to_string(&req.logics.unwrap_or_default())
        .map_err(|e| err(StatusCode::BAD_REQUEST, "BAD_REQUEST", e.to_string()))?;

    let release_id = Uuid::new_v4().to_string();
    Release::insert(entities::release::ActiveModel {
        id: Set(release_id.clone()),
        project: Set(req.project.clone()),
        env: Set(req.env.clone()),
        ref_name: Set(req.r#ref.clone()),
        schema_json: Set(schema_json.to_string()),
        permissions_yaml: Set(permissions),
        storage_yaml: Set(storage),
        logics_json: Set(logics),
        created_at: Set(Utc::now().to_rfc3339()),
    })
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;

    CurrentRelease::insert(entities::current_release::ActiveModel {
        project: Set(req.project.clone()),
        env: Set(req.env.clone()),
        release_id: Set(release_id.clone()),
    })
    .on_conflict(
        OnConflict::columns([
            entities::current_release::Column::Project,
            entities::current_release::Column::Env,
        ])
        .update_column(entities::current_release::Column::ReleaseId)
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;

    Ok(Json(
        serde_json::json!({"release_id": release_id, "reused": false, "dry_run": false}),
    ))
}

fn merge_schema(inputs: &[String]) -> Result<Value, (StatusCode, Json<ErrorBody>)> {
    let mut tables = serde_json::Map::new();
    for yaml in inputs {
        let v: Value = serde_yaml::from_str(yaml).map_err(|e| {
            err(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                format!("invalid schema yaml: {}", e),
            )
        })?;
        if let Some(obj) = v.get("tables").and_then(|t| t.as_object()) {
            for (k, val) in obj {
                tables.insert(k.clone(), val.clone());
            }
        }
    }
    Ok(serde_json::json!({"tables": Value::Object(tables)}))
}

async fn apply_schema_to_db(
    db: &DatabaseConnection,
    project: &str,
    env: &str,
    schema: &Value,
) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let row = Connection::find()
        .filter(entities::connection::Column::Project.eq(project))
        .filter(entities::connection::Column::Env.eq(env))
        .filter(entities::connection::Column::Name.eq("main"))
        .one(db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    let Some(row) = row else {
        return Ok(());
    };
    let db_url = row.db_url;
    let pg = Database::connect(&db_url).await.map_err(|e| {
        err(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("db connect failed: {}", e),
        )
    })?;

    let tables = schema
        .get("tables")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    for (table, def) in tables {
        let id_name = def
            .get("id")
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("id");
        let id_generate = def
            .get("id")
            .and_then(|v| v.get("generate"))
            .and_then(|v| v.as_str())
            .unwrap_or("ulid");
        let id_col = if id_generate == "ulid" {
            format!(
                "\"{}\" text PRIMARY KEY DEFAULT substr(md5(random()::text || clock_timestamp()::text),1,26)",
                id_name
            )
        } else {
            format!("\"{}\" text PRIMARY KEY", id_name)
        };
        let mut cols: Vec<String> = vec![id_col];
        if let Some(obj) = def.get("columns").and_then(|v| v.as_object()) {
            for (name, col) in obj {
                let t = col.get("type").and_then(|v| v.as_str()).unwrap_or("string");
                let sql_t = match t {
                    "int" => "bigint",
                    "float" => "double precision",
                    "boolean" | "bool" => "boolean",
                    "timestamp" => "timestamp",
                    "array" => {
                        let item = col
                            .get("items")
                            .and_then(|v| v.as_str())
                            .unwrap_or("string");
                        match item {
                            "int" => "bigint[]",
                            _ => "text[]",
                        }
                    }
                    _ => "text",
                };
                cols.push(format!("\"{}\" {}", name, sql_t));
            }
        }
        let create = format!(
            "CREATE TABLE IF NOT EXISTS \"{}\" ({})",
            table,
            cols.join(", ")
        );
        pg.execute(Statement::from_string(DbBackend::Postgres, create))
            .await
            .map_err(|e| err(StatusCode::BAD_REQUEST, "BAD_REQUEST", e.to_string()))?;
        if let Some(obj) = def.get("columns").and_then(|v| v.as_object()) {
            for (name, col) in obj {
                let t = col.get("type").and_then(|v| v.as_str()).unwrap_or("string");
                let sql_t = match t {
                    "int" => "bigint",
                    "float" => "double precision",
                    "boolean" | "bool" => "boolean",
                    "timestamp" => "timestamp",
                    "array" => {
                        let item = col
                            .get("items")
                            .and_then(|v| v.as_str())
                            .unwrap_or("string");
                        match item {
                            "int" => "bigint[]",
                            _ => "text[]",
                        }
                    }
                    _ => "text",
                };
                let alter = format!(
                    "ALTER TABLE \"{}\" ADD COLUMN IF NOT EXISTS \"{}\" {}",
                    table, name, sql_t
                );
                let _ = pg
                    .execute(Statement::from_string(DbBackend::Postgres, alter))
                    .await;
            }
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct ApiKeyCreateReq {
    project: String,
    env: String,
    name: String,
    roles: Vec<String>,
}

async fn apikey_create(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ApiKeyCreateReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let key_id = req.name.clone();
    let secret = Uuid::new_v4().simple().to_string();
    let api_key = format!("{}.{}", key_id, secret);
    ApiKey::insert(entities::apikey::ActiveModel {
        id: Set(key_id.clone()),
        name: Set(req.name),
        project: Set(req.project),
        env: Set(req.env),
        secret: Set(secret),
        roles_json: Set(serde_json::to_string(&req.roles).unwrap_or("[]".to_string())),
        revoked: Set(0),
        created_at: Set(Utc::now().to_rfc3339()),
    })
    .on_conflict(
        OnConflict::column(entities::apikey::Column::Id)
            .update_columns([
                entities::apikey::Column::Name,
                entities::apikey::Column::Project,
                entities::apikey::Column::Env,
                entities::apikey::Column::Secret,
                entities::apikey::Column::RolesJson,
                entities::apikey::Column::Revoked,
                entities::apikey::Column::CreatedAt,
            ])
            .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(
        serde_json::json!({"key_id": key_id, "api_key": api_key}),
    ))
}

#[derive(Deserialize)]
struct ApiKeyListQuery {
    project: String,
    env: String,
}

async fn apikey_list(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ApiKeyListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let rows = ApiKey::find()
        .filter(entities::apikey::Column::Project.eq(q.project))
        .filter(entities::apikey::Column::Env.eq(q.env))
        .order_by_desc(entities::apikey::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    let list: Vec<Value> = rows
        .into_iter()
        .map(|r| serde_json::json!({"id": r.id, "name": r.name, "revoked": r.revoked == 1}))
        .collect();
    Ok(Json(Value::Array(list)))
}

#[derive(Deserialize)]
struct ApiKeyRevokeReq {
    project: String,
    env: String,
    key_id: String,
}

async fn apikey_revoke(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ApiKeyRevokeReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    ApiKey::update_many()
        .col_expr(entities::apikey::Column::Revoked, 1.into())
        .filter(entities::apikey::Column::Project.eq(req.project))
        .filter(entities::apikey::Column::Env.eq(req.env))
        .filter(
            Condition::any()
                .add(entities::apikey::Column::Id.eq(req.key_id.clone()))
                .add(entities::apikey::Column::Name.eq(req.key_id)),
        )
        .exec(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct EndUserReq {
    project: String,
    env: String,
    email: String,
    password: String,
}

async fn enduser_signup(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EndUserReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let sub = Uuid::new_v4().to_string();
    EndUser::insert(entities::enduser::ActiveModel {
        project: Set(req.project),
        env: Set(req.env),
        email: Set(req.email),
        password: Set(req.password),
        sub: Set(sub),
    })
    .on_conflict(
        OnConflict::columns([
            entities::enduser::Column::Project,
            entities::enduser::Column::Env,
            entities::enduser::Column::Email,
        ])
        .update_columns([entities::enduser::Column::Password, entities::enduser::Column::Sub])
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

async fn enduser_login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EndUserReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let row = EndUser::find()
        .filter(entities::enduser::Column::Project.eq(&req.project))
        .filter(entities::enduser::Column::Env.eq(&req.env))
        .filter(entities::enduser::Column::Email.eq(&req.email))
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| {
        err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "invalid credentials",
        )
    })?;
    if row.password != req.password {
        return Err(err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "invalid credentials",
        ));
    }
    let token = Uuid::new_v4().to_string();
    Token::insert(entities::token::ActiveModel {
        token: Set(token.clone()),
        project: Set(req.project),
        env: Set(req.env),
        sub: Set(row.sub),
        roles_json: Set("[\"authenticated\",\"reader\"]".to_string()),
    })
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"access_token": token})))
}

#[derive(Deserialize, Serialize)]
struct OidcReq {
    project: String,
    env: String,
    name: String,
    issuer: String,
    auth_url: String,
    token_url: String,
    userinfo_url: String,
    client_id: String,
    client_secret: String,
    redirect_uris: Vec<String>,
}

async fn oidc_create(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<OidcReq>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    if !req.issuer.starts_with("https://") {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "invalid issuer",
        ));
    }
    let exists = OidcProvider::find()
        .filter(entities::oidc_provider::Column::Project.eq(&req.project))
        .filter(entities::oidc_provider::Column::Env.eq(&req.env))
        .filter(entities::oidc_provider::Column::Name.eq(&req.name))
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .is_some();
    if exists {
        return Err(err(
            StatusCode::CONFLICT,
            "CONFLICT",
            "provider already exists",
        ));
    }
    let payload = serde_json::to_string(&req).unwrap_or_else(|_| "{}".to_string());
    OidcProvider::insert(entities::oidc_provider::ActiveModel {
        project: Set(req.project),
        env: Set(req.env),
        name: Set(req.name),
        issuer: Set(req.issuer),
        payload_json: Set(payload),
    })
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok((StatusCode::CREATED, Json(serde_json::json!({"ok":true}))))
}

#[derive(Deserialize)]
struct ReleaseListQuery {
    project: String,
    env: String,
    limit: Option<i64>,
}

async fn release_list(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ReleaseListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let limit = q.limit.unwrap_or(20);
    let rows = Release::find()
        .filter(entities::release::Column::Project.eq(q.project))
        .filter(entities::release::Column::Env.eq(q.env))
        .order_by_desc(entities::release::Column::CreatedAt)
        .limit(limit as u64)
        .all(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    let list: Vec<Value> = rows
        .into_iter()
        .map(|r| serde_json::json!({"id": r.id, "ref": r.ref_name}))
        .collect();
    Ok(Json(Value::Array(list)))
}

#[derive(Deserialize)]
struct PromoteReq {
    project: String,
    from: String,
    to: String,
}

async fn release_promote(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PromoteReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    let row = CurrentRelease::find()
        .filter(entities::current_release::Column::Project.eq(&req.project))
        .filter(entities::current_release::Column::Env.eq(&req.from))
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| {
        err(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "source release not found",
        )
    })?;
    CurrentRelease::insert(entities::current_release::ActiveModel {
        project: Set(req.project),
        env: Set(req.to),
        release_id: Set(row.release_id),
    })
    .on_conflict(
        OnConflict::columns([
            entities::current_release::Column::Project,
            entities::current_release::Column::Env,
        ])
        .update_column(entities::current_release::Column::ReleaseId)
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct RollbackReq {
    project: String,
    env: String,
    to_release_id: String,
}

async fn release_rollback(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<RollbackReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    require_operator(&headers)?;
    CurrentRelease::insert(entities::current_release::ActiveModel {
        project: Set(req.project),
        env: Set(req.env),
        release_id: Set(req.to_release_id),
    })
    .on_conflict(
        OnConflict::columns([
            entities::current_release::Column::Project,
            entities::current_release::Column::Env,
        ])
        .update_column(entities::current_release::Column::ReleaseId)
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
struct InternalVerifyApiKeyReq {
    key_id: String,
    secret: String,
}

async fn internal_apikey_verify(
    State(state): State<Arc<AppState>>,
    Json(req): Json<InternalVerifyApiKeyReq>,
) -> Json<Value> {
    let row = ApiKey::find()
        .filter(entities::apikey::Column::Id.eq(&req.key_id))
        .filter(entities::apikey::Column::Secret.eq(&req.secret))
        .one(&state.db)
        .await
        .ok()
        .flatten();
    let Some(row) = row else {
        return Json(serde_json::json!({"valid": false}));
    };
    if row.revoked == 1 {
        return Json(serde_json::json!({"valid": false}));
    }
    let roles: Vec<String> = serde_json::from_str(&row.roles_json).unwrap_or_default();
    Json(serde_json::json!({
        "valid": true,
        "key": {
            "id": row.id,
            "project_id": row.project,
            "env_id": row.env,
            "project_name": row.project,
            "env_name": row.env,
            "roles": roles,
        }
    }))
}

#[derive(Deserialize)]
struct InternalVerifyTokenReq {
    token: String,
}

async fn internal_token_verify(
    State(state): State<Arc<AppState>>,
    Json(req): Json<InternalVerifyTokenReq>,
) -> Json<Value> {
    let row = Token::find_by_id(req.token)
        .one(&state.db)
        .await
        .ok()
        .flatten();
    let Some(row) = row else {
        return Json(serde_json::json!({"valid": false}));
    };
    let roles: Vec<String> = serde_json::from_str(&row.roles_json).unwrap_or_default();
    Json(serde_json::json!({
        "valid": true,
        "claims": {
            "project": row.project,
            "env": row.env,
            "sub": row.sub,
            "roles": roles,
        }
    }))
}

async fn internal_current_release(
    State(state): State<Arc<AppState>>,
    Path((project, env)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let current = CurrentRelease::find()
        .filter(entities::current_release::Column::Project.eq(&project))
        .filter(entities::current_release::Column::Env.eq(&env))
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "no current release"))?;
    let rel = Release::find_by_id(current.release_id.clone())
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "release not found"))?;

    let schema_text = rel.schema_json;
    let schema: Value =
        serde_json::from_str(&schema_text).unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let permissions_yaml = rel.permissions_yaml;
    let permissions: Value = serde_yaml::from_str(&permissions_yaml)
        .unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let storage_yaml = rel.storage_yaml;
    let storage: Value =
        serde_yaml::from_str(&storage_yaml).unwrap_or_else(|_| serde_json::json!({}));
    let logics_text = rel.logics_json;
    let logics: Value =
        serde_json::from_str(&logics_text).unwrap_or_else(|_| serde_json::json!({}));

    let conn_rows = Connection::find()
        .filter(entities::connection::Column::Project.eq(&project))
        .filter(entities::connection::Column::Env.eq(&env))
        .all(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    let mut connections = serde_json::Map::new();
    for r in conn_rows {
        let name = r.name.clone();
        connections.insert(
            name,
            serde_json::json!({
                "name": r.name,
                "engine": r.engine,
                "db_url": r.db_url,
            }),
        );
    }

    Ok(Json(serde_json::json!({
        "release_id": current.release_id,
        "schema": schema,
        "permissions": permissions,
        "storage": storage,
        "logics": logics,
        "connections": Value::Object(connections),
    })))
}

async fn internal_latest_release(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let latest = Release::find()
        .order_by_desc(entities::release::Column::CreatedAt)
        .one(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "no current release"))?;
    let project = latest.project.clone();
    let env = latest.env.clone();
    let rid = latest.id.clone();

    let schema_text = latest.schema_json;
    let schema: Value =
        serde_json::from_str(&schema_text).unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let permissions_yaml = latest.permissions_yaml;
    let permissions: Value = serde_yaml::from_str(&permissions_yaml)
        .unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let storage_yaml = latest.storage_yaml;
    let storage: Value =
        serde_yaml::from_str(&storage_yaml).unwrap_or_else(|_| serde_json::json!({}));
    let logics_text = latest.logics_json;
    let logics: Value =
        serde_json::from_str(&logics_text).unwrap_or_else(|_| serde_json::json!({}));

    let conn_rows = Connection::find()
        .filter(entities::connection::Column::Project.eq(&project))
        .filter(entities::connection::Column::Env.eq(&env))
        .all(&state.db)
        .await
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))?;
    let mut connections = serde_json::Map::new();
    for r in conn_rows {
        let name = r.name.clone();
        connections.insert(
            name,
            serde_json::json!({
                "name": r.name,
                "engine": r.engine,
                "db_url": r.db_url,
            }),
        );
    }

    Ok(Json(serde_json::json!({
        "release_id": rid,
        "project": project,
        "env": env,
        "schema": schema,
        "permissions": permissions,
        "storage": storage,
        "logics": logics,
        "connections": Value::Object(connections),
    })))
}
