use std::collections::HashMap;
use std::path::Path as FsPath;
use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use sea_orm::{
    ConnectionTrait, Database, DatabaseConnection, DbBackend, ExecResult, QueryResult, Statement,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

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

fn sqlx_to_sea(v: impl Into<String>) -> sea_orm::Value {
    sea_orm::Value::String(Some(Box::new(v.into())))
}

fn sea_i64(v: i64) -> sea_orm::Value {
    sea_orm::Value::BigInt(Some(v))
}

async fn db_exec(
    db: &DatabaseConnection,
    sql: &str,
    values: Vec<sea_orm::Value>,
) -> Result<ExecResult, (StatusCode, Json<ErrorBody>)> {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql.to_string(),
        values,
    ))
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))
}

async fn db_query_one(
    db: &DatabaseConnection,
    sql: &str,
    values: Vec<sea_orm::Value>,
) -> Result<Option<QueryResult>, (StatusCode, Json<ErrorBody>)> {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql.to_string(),
        values,
    ))
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))
}

async fn db_query_all(
    db: &DatabaseConnection,
    sql: &str,
    values: Vec<sea_orm::Value>,
) -> Result<Vec<QueryResult>, (StatusCode, Json<ErrorBody>)> {
    db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql.to_string(),
        values,
    ))
    .await
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", e.to_string()))
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
    db_exec(
        &state.db,
        "INSERT OR IGNORE INTO projects(name) VALUES (?1)",
        vec![sqlx_to_sea(req.project)],
    )
    .await?;
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
    db_exec(
        &state.db,
        "INSERT OR IGNORE INTO envs(project,name) VALUES (?1,?2)",
        vec![sqlx_to_sea(req.project), sqlx_to_sea(req.env)],
    )
    .await?;
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
    db_exec(
        &state.db,
        "INSERT INTO connections(project,env,name,engine,db_url) VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(project,env,name) DO UPDATE SET engine=excluded.engine, db_url=excluded.db_url",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.name),
            sqlx_to_sea(req.engine),
            sqlx_to_sea(req.db_url),
        ],
    )
    .await?;
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
    let row = db_query_one(
        &state.db,
        "SELECT db_url FROM connections WHERE project=?1 AND env=?2 AND name=?3",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.name),
        ],
    )
    .await?
    .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "connection not found"))?;
    let db_url: String = row.try_get_by("db_url").unwrap_or_default();
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
    db_exec(
        &state.db,
        "INSERT INTO releases(id,project,env,ref,schema_json,permissions_yaml,storage_yaml,logics_json,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        vec![
            sqlx_to_sea(&release_id),
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(&req.r#ref),
            sqlx_to_sea(schema_json.to_string()),
            sqlx_to_sea(permissions),
            sqlx_to_sea(storage),
            sqlx_to_sea(logics),
            sqlx_to_sea(Utc::now().to_rfc3339()),
        ],
    )
    .await?;

    db_exec(
        &state.db,
        "INSERT INTO current_releases(project,env,release_id) VALUES (?1,?2,?3) ON CONFLICT(project,env) DO UPDATE SET release_id=excluded.release_id",
        vec![
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(&release_id),
        ],
    )
    .await?;

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
    let row = db_query_one(
        db,
        "SELECT db_url FROM connections WHERE project=?1 AND env=?2 AND name='main'",
        vec![sqlx_to_sea(project), sqlx_to_sea(env)],
    )
    .await?;
    let Some(row) = row else {
        return Ok(());
    };
    let db_url: String = row.try_get_by("db_url").unwrap_or_default();
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
    db_exec(
        &state.db,
        "INSERT OR REPLACE INTO apikeys(id,name,project,env,secret,roles_json,revoked,created_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7)",
        vec![
            sqlx_to_sea(&key_id),
            sqlx_to_sea(&req.name),
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(&secret),
            sqlx_to_sea(serde_json::to_string(&req.roles).unwrap_or("[]".to_string())),
            sqlx_to_sea(Utc::now().to_rfc3339()),
        ],
    )
    .await?;
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
    let rows = db_query_all(
        &state.db,
        "SELECT id,name,revoked FROM apikeys WHERE project=?1 AND env=?2 ORDER BY created_at DESC",
        vec![sqlx_to_sea(q.project), sqlx_to_sea(q.env)],
    )
    .await?;
    let list: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get_by::<String,_>("id").unwrap_or_default(),
                "name": r.try_get_by::<String,_>("name").unwrap_or_default(),
                "revoked": r.try_get_by::<i64,_>("revoked").unwrap_or(0) == 1
            })
        })
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
    db_exec(
        &state.db,
        "UPDATE apikeys SET revoked=1 WHERE project=?1 AND env=?2 AND (id=?3 OR name=?3)",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.key_id),
        ],
    )
    .await?;
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
    db_exec(
        &state.db,
        "INSERT OR REPLACE INTO endusers(project,env,email,password,sub) VALUES (?1,?2,?3,?4,?5)",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.email),
            sqlx_to_sea(req.password),
            sqlx_to_sea(sub),
        ],
    )
    .await?;
    Ok(Json(serde_json::json!({"ok":true})))
}

async fn enduser_login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EndUserReq>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let row = db_query_one(
        &state.db,
        "SELECT sub,password FROM endusers WHERE project=?1 AND env=?2 AND email=?3",
        vec![
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(&req.email),
        ],
    )
    .await?
    .ok_or_else(|| {
        err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "invalid credentials",
        )
    })?;
    let pw: String = row.try_get_by("password").unwrap_or_default();
    if pw != req.password {
        return Err(err(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "invalid credentials",
        ));
    }
    let sub: String = row.try_get_by("sub").unwrap_or_default();
    let token = Uuid::new_v4().to_string();
    db_exec(
        &state.db,
        "INSERT OR REPLACE INTO tokens(token,project,env,sub,roles_json) VALUES (?1,?2,?3,?4,?5)",
        vec![
            sqlx_to_sea(&token),
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(sub),
            sqlx_to_sea("[\"authenticated\",\"reader\"]"),
        ],
    )
    .await?;
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
    let exists = db_query_one(
        &state.db,
        "SELECT 1 FROM oidc_providers WHERE project=?1 AND env=?2 AND name=?3",
        vec![
            sqlx_to_sea(&req.project),
            sqlx_to_sea(&req.env),
            sqlx_to_sea(&req.name),
        ],
    )
    .await?
    .is_some();
    if exists {
        return Err(err(
            StatusCode::CONFLICT,
            "CONFLICT",
            "provider already exists",
        ));
    }
    let payload = serde_json::to_string(&req).unwrap_or_else(|_| "{}".to_string());
    db_exec(
        &state.db,
        "INSERT INTO oidc_providers(project,env,name,issuer,payload_json) VALUES (?1,?2,?3,?4,?5)",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.name),
            sqlx_to_sea(req.issuer),
            sqlx_to_sea(payload),
        ],
    )
    .await?;
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
    let rows = db_query_all(
        &state.db,
        "SELECT id,ref,created_at FROM releases WHERE project=?1 AND env=?2 ORDER BY created_at DESC LIMIT ?3",
        vec![sqlx_to_sea(q.project), sqlx_to_sea(q.env), sea_i64(limit)],
    )
    .await?;
    let list: Vec<Value> = rows
        .into_iter()
        .map(|r| serde_json::json!({"id": r.try_get_by::<String,_>("id").unwrap_or_default(), "ref": r.try_get_by::<String,_>("ref").unwrap_or_default()}))
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
    let row = db_query_one(
        &state.db,
        "SELECT release_id FROM current_releases WHERE project=?1 AND env=?2",
        vec![sqlx_to_sea(&req.project), sqlx_to_sea(&req.from)],
    )
    .await?
    .ok_or_else(|| {
        err(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            "source release not found",
        )
    })?;
    let rid: String = row.try_get_by("release_id").unwrap_or_default();
    db_exec(
        &state.db,
        "INSERT INTO current_releases(project,env,release_id) VALUES (?1,?2,?3) ON CONFLICT(project,env) DO UPDATE SET release_id=excluded.release_id",
        vec![sqlx_to_sea(req.project), sqlx_to_sea(req.to), sqlx_to_sea(rid)],
    )
    .await?;
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
    db_exec(
        &state.db,
        "INSERT INTO current_releases(project,env,release_id) VALUES (?1,?2,?3) ON CONFLICT(project,env) DO UPDATE SET release_id=excluded.release_id",
        vec![
            sqlx_to_sea(req.project),
            sqlx_to_sea(req.env),
            sqlx_to_sea(req.to_release_id),
        ],
    )
    .await?;
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
    let row = db_query_one(
        &state.db,
        "SELECT id,project,env,roles_json,revoked FROM apikeys WHERE id=?1 AND secret=?2",
        vec![sqlx_to_sea(&req.key_id), sqlx_to_sea(&req.secret)],
    )
    .await
    .ok()
    .flatten();
    let Some(row) = row else {
        return Json(serde_json::json!({"valid": false}));
    };
    if row.try_get_by::<i64, _>("revoked").unwrap_or(1) == 1 {
        return Json(serde_json::json!({"valid": false}));
    }
    let roles_json: String = row.try_get_by("roles_json").unwrap_or("[]".to_string());
    let roles: Vec<String> = serde_json::from_str(&roles_json).unwrap_or_default();
    Json(serde_json::json!({
        "valid": true,
        "key": {
            "id": row.try_get_by::<String,_>("id").unwrap_or_default(),
            "project_id": row.try_get_by::<String,_>("project").unwrap_or_default(),
            "env_id": row.try_get_by::<String,_>("env").unwrap_or_default(),
            "project_name": row.try_get_by::<String,_>("project").unwrap_or_default(),
            "env_name": row.try_get_by::<String,_>("env").unwrap_or_default(),
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
    let row = db_query_one(
        &state.db,
        "SELECT project,env,sub,roles_json FROM tokens WHERE token=?1",
        vec![sqlx_to_sea(req.token)],
    )
    .await
    .ok()
    .flatten();
    let Some(row) = row else {
        return Json(serde_json::json!({"valid": false}));
    };
    let roles: Vec<String> = serde_json::from_str(
        &row.try_get_by::<String, _>("roles_json")
            .unwrap_or("[]".to_string()),
    )
    .unwrap_or_default();
    Json(serde_json::json!({
        "valid": true,
        "claims": {
            "project": row.try_get_by::<String,_>("project").unwrap_or_default(),
            "env": row.try_get_by::<String,_>("env").unwrap_or_default(),
            "sub": row.try_get_by::<String,_>("sub").unwrap_or_default(),
            "roles": roles,
        }
    }))
}

async fn internal_current_release(
    State(state): State<Arc<AppState>>,
    Path((project, env)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let current = db_query_one(
        &state.db,
        "SELECT release_id FROM current_releases WHERE project=?1 AND env=?2",
        vec![sqlx_to_sea(&project), sqlx_to_sea(&env)],
    )
    .await?
    .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "no current release"))?;
    let rid: String = current.try_get_by("release_id").unwrap_or_default();

    let rel = db_query_one(
        &state.db,
        "SELECT schema_json,permissions_yaml,storage_yaml,logics_json FROM releases WHERE id=?1",
        vec![sqlx_to_sea(&rid)],
    )
    .await?
    .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "release not found"))?;

    let schema_text: String = rel.try_get_by("schema_json").unwrap_or("{}".to_string());
    let schema: Value =
        serde_json::from_str(&schema_text).unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let permissions_yaml: String = rel
        .try_get_by("permissions_yaml")
        .unwrap_or("tables: {}\n".to_string());
    let permissions: Value = serde_yaml::from_str(&permissions_yaml)
        .unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let storage_yaml: String = rel.try_get_by("storage_yaml").unwrap_or("{}\n".to_string());
    let storage: Value =
        serde_yaml::from_str(&storage_yaml).unwrap_or_else(|_| serde_json::json!({}));
    let logics_text: String = rel.try_get_by("logics_json").unwrap_or("{}".to_string());
    let logics: Value =
        serde_json::from_str(&logics_text).unwrap_or_else(|_| serde_json::json!({}));

    let conn_rows = db_query_all(
        &state.db,
        "SELECT name,engine,db_url FROM connections WHERE project=?1 AND env=?2",
        vec![sqlx_to_sea(&project), sqlx_to_sea(&env)],
    )
    .await?;
    let mut connections = serde_json::Map::new();
    for r in conn_rows {
        let name: String = r.try_get_by("name").unwrap_or_default();
        connections.insert(
            name,
            serde_json::json!({
                "name": r.try_get_by::<String,_>("name").unwrap_or_default(),
                "engine": r.try_get_by::<String,_>("engine").unwrap_or_default(),
                "db_url": r.try_get_by::<String,_>("db_url").unwrap_or_default(),
            }),
        );
    }

    Ok(Json(serde_json::json!({
        "release_id": rid,
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
    let row = db_query_one(
        &state.db,
        "SELECT c.project AS project, c.env AS env, c.release_id AS release_id \
         FROM current_releases c \
         JOIN releases r ON r.id = c.release_id \
         ORDER BY r.created_at DESC LIMIT 1",
        vec![],
    )
    .await?
    .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "no current release"))?;

    let project: String = row.try_get_by("project").unwrap_or_default();
    let env: String = row.try_get_by("env").unwrap_or_default();
    let rid: String = row.try_get_by("release_id").unwrap_or_default();

    let rel = db_query_one(
        &state.db,
        "SELECT schema_json,permissions_yaml,storage_yaml,logics_json FROM releases WHERE id=?1",
        vec![sqlx_to_sea(&rid)],
    )
    .await?
    .ok_or_else(|| err(StatusCode::NOT_FOUND, "NOT_FOUND", "release not found"))?;

    let schema_text: String = rel.try_get_by("schema_json").unwrap_or("{}".to_string());
    let schema: Value =
        serde_json::from_str(&schema_text).unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let permissions_yaml: String = rel
        .try_get_by("permissions_yaml")
        .unwrap_or("tables: {}\n".to_string());
    let permissions: Value = serde_yaml::from_str(&permissions_yaml)
        .unwrap_or_else(|_| serde_json::json!({"tables":{}}));
    let storage_yaml: String = rel.try_get_by("storage_yaml").unwrap_or("{}\n".to_string());
    let storage: Value =
        serde_yaml::from_str(&storage_yaml).unwrap_or_else(|_| serde_json::json!({}));
    let logics_text: String = rel.try_get_by("logics_json").unwrap_or("{}".to_string());
    let logics: Value =
        serde_json::from_str(&logics_text).unwrap_or_else(|_| serde_json::json!({}));

    let conn_rows = db_query_all(
        &state.db,
        "SELECT name,engine,db_url FROM connections WHERE project=?1 AND env=?2",
        vec![sqlx_to_sea(&project), sqlx_to_sea(&env)],
    )
    .await?;
    let mut connections = serde_json::Map::new();
    for r in conn_rows {
        let name: String = r.try_get_by("name").unwrap_or_default();
        connections.insert(
            name,
            serde_json::json!({
                "name": r.try_get_by::<String,_>("name").unwrap_or_default(),
                "engine": r.try_get_by::<String,_>("engine").unwrap_or_default(),
                "db_url": r.try_get_by::<String,_>("db_url").unwrap_or_default(),
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
