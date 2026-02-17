use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Column, Row};

#[derive(Clone)]
struct AppState {
    hub_url: String,
    client: reqwest::Client,
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl AppError {
    fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST",
            message: msg.into(),
        }
    }
    fn unauthorized(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED",
            message: msg.into(),
        }
    }
    fn forbidden(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN",
            message: msg.into(),
        }
    }
    fn not_found(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND",
            message: msg.into(),
        }
    }
    fn internal(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL",
            message: msg.into(),
        }
    }
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let body = serde_json::json!({
            "error": {
                "code": self.code,
                "message": self.message,
                "requestId": uuid::Uuid::new_v4().to_string(),
            }
        });
        (self.status, Json(body)).into_response()
    }
}

type Result<T> = std::result::Result<T, AppError>;

#[derive(Deserialize)]
struct CallReq {
    path: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct CallResp {
    data: Value,
}

#[derive(Debug, Clone)]
enum Principal {
    Anonymous,
    ApiKey { key_id: String, roles: Vec<String> },
    EndUser { sub: String, roles: Vec<String> },
}

#[derive(Debug, Deserialize)]
struct ReleasePayload {
    release_id: String,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    env: Option<String>,
    schema: Value,
    permissions: Value,
    #[allow(dead_code)]
    storage: Value,
    logics: HashMap<String, String>,
    connections: HashMap<String, ConnectionInfo>,
}

#[derive(Debug, Deserialize, Clone)]
struct ConnectionInfo {
    name: String,
    engine: String,
    db_url: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let port: u16 = std::env::var("STK_BRIDGE_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3000);
    let hub_url = std::env::var("STK_HUB_URL").unwrap_or_else(|_| "http://hub:4000".to_string());

    let state = Arc::new(AppState {
        hub_url,
        client: reqwest::Client::new(),
    });
    let app = Router::new()
        .route("/health", get(health))
        .route("/call", post(call))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(serde_json::json!({"ok": true}))
}

async fn call(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CallReq>,
) -> Result<Json<CallResp>> {
    if req.path.starts_with("db/") {
        let has_api_key = headers
            .get("x-santokit-api-key")
            .and_then(|v| v.to_str().ok())
            .map(|v| !v.is_empty())
            .unwrap_or(false);
        let has_bearer = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|v| !v.is_empty())
            .unwrap_or(false);
        if !has_api_key && !has_bearer {
            return Err(AppError::unauthorized("Authentication required"));
        }
    }

    let project = headers
        .get("x-santokit-project")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let env = headers
        .get("x-santokit-env")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let has_api_key = headers
        .get("x-santokit-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    let has_bearer = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|v| !v.is_empty())
        .unwrap_or(false);

    let (Some(project), Some(env)) = (project, env) else {
        if let Some(name) = req.path.strip_prefix("logics/") {
            if has_api_key || has_bearer {
                return Err(AppError::bad_request(
                    "Missing X-Santokit-Project or X-Santokit-Env",
                ));
            }
            let release = load_latest_release(&state).await?;
            let data = handle_logic(&release, &Principal::Anonymous, name, req.params).await?;
            return Ok(Json(CallResp { data }));
        }
        return Err(AppError::bad_request(
            "Missing X-Santokit-Project or X-Santokit-Env",
        ));
    };

    let principal = authenticate(&state, &headers, &project, &env).await?;
    let release = load_release(&state, &project, &env).await?;

    if let Some(rest) = req.path.strip_prefix("db/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() != 2 {
            return Err(AppError::bad_request("Invalid db path"));
        }
        let data = handle_db(&release, &principal, parts[0], parts[1], req.params).await?;
        return Ok(Json(CallResp { data }));
    }
    if let Some(name) = req.path.strip_prefix("logics/") {
        let data = handle_logic(&release, &principal, name, req.params).await?;
        return Ok(Json(CallResp { data }));
    }

    Err(AppError::not_found("path not found"))
}

async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    project: &str,
    env: &str,
) -> Result<Principal> {
    if let Some(raw) = headers
        .get("x-santokit-api-key")
        .and_then(|v| v.to_str().ok())
    {
        let (key_id, secret) = raw
            .split_once('.')
            .ok_or_else(|| AppError::unauthorized("invalid api key format"))?;
        let body = state
            .client
            .post(format!("{}/internal/apikeys/verify", state.hub_url))
            .json(&serde_json::json!({"key_id": key_id, "secret": secret}))
            .send()
            .await
            .map_err(|e| AppError::internal(e.to_string()))?
            .json::<Value>()
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        if body.get("valid").and_then(|v| v.as_bool()) != Some(true) {
            return Err(AppError::unauthorized("Invalid API key"));
        }
        let key = body.get("key").unwrap_or(&Value::Null);
        let key_project = key
            .get("project_name")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let key_env = key
            .get("env_name")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if key_project != project || key_env != env {
            return Err(AppError::forbidden("API key context mismatch"));
        }
        let roles = key
            .get("roles")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(ToString::to_string))
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        return Ok(Principal::ApiKey {
            key_id: key_id.to_string(),
            roles,
        });
    }

    if let Some(token) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        let body = state
            .client
            .post(format!("{}/internal/tokens/verify", state.hub_url))
            .json(&serde_json::json!({"token": token}))
            .send()
            .await
            .map_err(|e| AppError::internal(e.to_string()))?
            .json::<Value>()
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        if body.get("valid").and_then(|v| v.as_bool()) != Some(true) {
            return Err(AppError::unauthorized("invalid token"));
        }
        let claims = body.get("claims").unwrap_or(&Value::Null);
        let t_project = claims
            .get("project")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let t_env = claims
            .get("env")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if t_project != project || t_env != env {
            return Err(AppError::forbidden("Access token context mismatch"));
        }
        let roles = claims
            .get("roles")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(ToString::to_string))
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let sub = claims
            .get("sub")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        return Ok(Principal::EndUser { sub, roles });
    }

    Ok(Principal::Anonymous)
}

async fn load_release(state: &AppState, project: &str, env: &str) -> Result<ReleasePayload> {
    let r = state
        .client
        .get(format!(
            "{}/internal/releases/{}/{}/current",
            state.hub_url, project, env
        ))
        .send()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if r.status() == StatusCode::NOT_FOUND {
        return Err(AppError::not_found("No release"));
    }
    r.json::<ReleasePayload>()
        .await
        .map_err(|e| AppError::internal(format!("invalid release payload: {}", e)))
}

async fn load_latest_release(state: &AppState) -> Result<ReleasePayload> {
    let r = state
        .client
        .get(format!(
            "{}/internal/releases/latest/current",
            state.hub_url
        ))
        .send()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    if r.status() == StatusCode::NOT_FOUND {
        return Err(AppError::not_found("No release"));
    }
    r.json::<ReleasePayload>()
        .await
        .map_err(|e| AppError::internal(format!("invalid release payload: {}", e)))
}

fn principal_roles(p: &Principal) -> Vec<String> {
    match p {
        Principal::ApiKey { roles, .. } | Principal::EndUser { roles, .. } => roles.clone(),
        Principal::Anonymous => vec![],
    }
}

fn is_enduser(p: &Principal) -> bool {
    matches!(p, Principal::EndUser { .. })
}

fn require_auth_for_db(p: &Principal) -> Result<()> {
    if matches!(p, Principal::Anonymous) {
        Err(AppError::unauthorized("Authentication required"))
    } else {
        Ok(())
    }
}

fn table_def<'a>(schema: &'a Value, table: &str) -> Result<&'a Value> {
    schema
        .get("tables")
        .and_then(|v| v.get(table))
        .ok_or_else(|| AppError::not_found(format!("Table not found: {}", table)))
}

fn column_type(col: &Value) -> &str {
    col.get("type").and_then(|v| v.as_str()).unwrap_or("string")
}

fn validate_array_value(col_name: &str, col_def: &Value, value: &Value) -> Result<()> {
    if column_type(col_def) != "array" {
        return Ok(());
    }
    let Some(arr) = value.as_array() else {
        return Err(AppError::bad_request(format!(
            "Invalid type for column '{}': expected array",
            col_name
        )));
    };
    let item_ty = col_def
        .get("items")
        .and_then(|v| v.as_str())
        .unwrap_or("string");
    for v in arr {
        let ok = match item_ty {
            "int" => v.is_i64() || v.is_u64(),
            _ => v.is_string(),
        };
        if !ok {
            return Err(AppError::bad_request(format!(
                "Invalid type for column '{}': expected {}",
                col_name, item_ty
            )));
        }
    }
    Ok(())
}

fn parse_rule_list(op_rules: &Value) -> Vec<Value> {
    if op_rules.is_array() {
        op_rules.as_array().cloned().unwrap_or_default()
    } else if op_rules.is_object() {
        vec![op_rules.clone()]
    } else {
        vec![]
    }
}

#[derive(Default)]
struct EvalOutcome {
    allowed: bool,
    filters: Vec<(String, Value)>,
    columns: Option<Vec<String>>,
}

fn eval_permissions(
    permissions: &Value,
    table: &str,
    op: &str,
    principal: &Principal,
) -> Result<EvalOutcome> {
    let mut out = EvalOutcome::default();
    let rules = permissions
        .get("tables")
        .and_then(|v| v.get(table))
        .and_then(|v| v.get(op))
        .map(parse_rule_list)
        .unwrap_or_default();
    let roles = principal_roles(principal);

    for rule in rules {
        let role_list = rule
            .get("roles")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut matched = false;
        for r in role_list {
            if let Some(name) = r.as_str() {
                if name == "public" {
                    matched = true;
                } else if name == "authenticated" {
                    matched = is_enduser(principal);
                } else if roles.iter().any(|rr| rr == name) {
                    matched = true;
                }
                if matched {
                    break;
                }
            }
        }
        if !matched {
            continue;
        }

        if let Some(c) = rule.get("columns").and_then(|v| v.as_array()) {
            let cols = c
                .iter()
                .filter_map(|v| v.as_str().map(ToString::to_string))
                .collect::<Vec<_>>();
            out.columns = Some(cols);
        }

        if let Some(cond) = rule.get("condition").and_then(|v| v.as_str()) {
            let Some((left, right)) = cond.split_once("==") else {
                return Err(AppError::bad_request(
                    "unsupported CEL operator in condition",
                ));
            };
            let left = left.trim();
            let right = right.trim();
            let parse_val = |token: &str, principal: &Principal| -> Result<Value> {
                if token == "request.auth.sub" {
                    let sub = match principal {
                        Principal::EndUser { sub, .. } => sub.clone(),
                        Principal::ApiKey { key_id, .. } => key_id.clone(),
                        Principal::Anonymous => "".to_string(),
                    };
                    Ok(Value::String(sub))
                } else if token.starts_with('"') && token.ends_with('"') {
                    Ok(Value::String(token.trim_matches('"').to_string()))
                } else {
                    Err(AppError::bad_request("unsupported CEL value"))
                }
            };
            if let Some(col) = left.strip_prefix("resource.") {
                out.filters
                    .push((col.to_string(), parse_val(right, principal)?));
            } else if let Some(col) = right.strip_prefix("resource.") {
                out.filters
                    .push((col.to_string(), parse_val(left, principal)?));
            } else {
                return Err(AppError::bad_request("unsupported CEL condition"));
            }
        }

        out.allowed = true;
        return Ok(out);
    }

    Ok(out)
}

async fn handle_db(
    release: &ReleasePayload,
    principal: &Principal,
    table: &str,
    op: &str,
    params: Value,
) -> Result<Value> {
    require_auth_for_db(principal)?;
    let table_def = table_def(&release.schema, table)?;
    let perm = eval_permissions(&release.permissions, table, op, principal)?;
    if !perm.allowed {
        return Err(AppError::bad_request("Access denied"));
    }

    let conn_name = table_def
        .get("connection")
        .and_then(|v| v.as_str())
        .unwrap_or("main");
    let conn = release
        .connections
        .get(conn_name)
        .ok_or_else(|| AppError::internal("connection not found"))?;
    if conn.engine != "postgres" {
        return Err(AppError::internal("unsupported engine"));
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect(&conn.db_url)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let cols_def = table_def
        .get("columns")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let id_name = table_def
        .get("id")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("id");
    let id_generate = table_def
        .get("id")
        .and_then(|v| v.get("generate"))
        .and_then(|v| v.as_str())
        .unwrap_or("ulid");

    match op {
        "insert" => {
            let values = params
                .get("values")
                .or_else(|| params.get("data"))
                .and_then(|v| v.as_object())
                .ok_or_else(|| AppError::bad_request("Missing values for insert"))?;

            if let Some(allowed) = &perm.columns {
                if allowed != &["*".to_string()] {
                    for k in values.keys() {
                        if !allowed.contains(k) {
                            return Err(AppError::bad_request(format!(
                                "Column '{}' is not allowed for insert",
                                k
                            )));
                        }
                    }
                }
            }

            let mut data = values.clone();
            if id_generate == "ulid" {
                if data.contains_key(id_name) {
                    return Err(AppError::bad_request(
                        "ID should not be provided for server-generated IDs",
                    ));
                }
                data.insert(
                    id_name.to_string(),
                    Value::String(ulid::Ulid::new().to_string()),
                );
            }

            for (name, v) in &data {
                if let Some(cdef) = cols_def.get(name) {
                    validate_array_value(name, cdef, v)?;
                }
            }

            let mut names = Vec::new();
            let mut placeholders = Vec::new();
            let mut vals = Vec::new();
            for (i, (k, v)) in data.iter().enumerate() {
                names.push(format!("\"{}\"", k));
                placeholders.push(format!("${}", i + 1));
                vals.push(v.clone());
            }
            let sql = format!(
                "INSERT INTO \"{}\" ({}) VALUES ({}) RETURNING *",
                table,
                names.join(", "),
                placeholders.join(", ")
            );
            let rows = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
                .fetch_all(&pool)
                .await
                .map_err(|e| AppError::internal(e.to_string()))?;
            let row = rows
                .into_iter()
                .next()
                .map(row_to_json)
                .unwrap_or(Value::Null);
            Ok(row)
        }
        "select" => {
            let mut conditions: Vec<(String, Value)> = vec![];
            if let Some(obj) = params.get("where").and_then(|v| v.as_object()) {
                for (k, v) in obj {
                    conditions.push((k.clone(), v.clone()));
                }
            }
            for f in perm.filters {
                conditions.push(f);
            }

            let mut sql = format!("SELECT * FROM \"{}\"", table);
            let mut vals = Vec::new();
            if !conditions.is_empty() {
                let mut parts = Vec::new();
                for (idx, (k, v)) in conditions.iter().enumerate() {
                    parts.push(format!("\"{}\" = ${}", k, idx + 1));
                    vals.push(v.clone());
                }
                sql.push_str(&format!(" WHERE {}", parts.join(" AND ")));
            }
            if let Some(ob) = params.get("orderBy").and_then(|v| v.as_object()) {
                if let Some((k, dirv)) = ob.iter().next() {
                    let dir = dirv.as_str().unwrap_or("").to_ascii_lowercase();
                    if dir != "asc" && dir != "desc" {
                        return Err(AppError::bad_request("Invalid orderBy direction"));
                    }
                    sql.push_str(&format!(" ORDER BY \"{}\" {}", k, dir.to_uppercase()));
                }
            }
            if let Some(limit) = params.get("limit").and_then(|v| v.as_i64()) {
                if limit < 0 {
                    return Err(AppError::bad_request("limit must be non-negative"));
                }
                sql.push_str(&format!(" LIMIT {}", limit));
            }
            if let Some(offset) = params.get("offset").and_then(|v| v.as_i64()) {
                if offset < 0 {
                    return Err(AppError::bad_request("offset must be non-negative"));
                }
                sql.push_str(&format!(" OFFSET {}", offset));
            }

            let mut rows: Vec<Value> = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
                .fetch_all(&pool)
                .await
                .map_err(|e| AppError::internal(e.to_string()))?
                .into_iter()
                .map(row_to_json)
                .collect();

            if let Some(expands) = params.get("expand").and_then(|v| v.as_array()) {
                for ex in expands {
                    let Some(rel) = ex.as_str() else {
                        continue;
                    };
                    let mut found = None;
                    for (col_name, cdef) in &cols_def {
                        if cdef
                            .get("references")
                            .and_then(|r| r.get("as"))
                            .and_then(|v| v.as_str())
                            == Some(rel)
                        {
                            let target = cdef
                                .get("references")
                                .and_then(|r| r.get("table"))
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();
                            found = Some((col_name.clone(), target.to_string()));
                            break;
                        }
                    }
                    let Some((fk_col, target_table)) = found else {
                        return Err(AppError::bad_request(format!(
                            "Unknown expand relation: {}",
                            rel
                        )));
                    };
                    for row in &mut rows {
                        let Some(fk) = row.get(&fk_col).cloned() else {
                            continue;
                        };
                        let q = format!(
                            "SELECT * FROM \"{}\" WHERE \"id\" = $1 LIMIT 1",
                            target_table
                        );
                        let one = bind_values(sqlx::query::<sqlx::Postgres>(&q), vec![fk])
                            .fetch_optional(&pool)
                            .await
                            .map_err(|e| AppError::internal(e.to_string()))?
                            .map(row_to_json)
                            .unwrap_or(Value::Null);
                        if let Some(obj) = row.as_object_mut() {
                            obj.insert(rel.to_string(), one);
                        }
                    }
                }
            }

            if let Some(allowed) = perm.columns {
                if allowed != ["*".to_string()] {
                    for row in &mut rows {
                        if let Some(obj) = row.as_object_mut() {
                            obj.retain(|k, _| allowed.contains(k));
                        }
                    }
                }
            }

            Ok(serde_json::json!({"data": rows}))
        }
        "update" => {
            let where_obj = params
                .get("where")
                .and_then(|v| v.as_object())
                .ok_or_else(|| AppError::bad_request("Update requires where clause"))?;
            if where_obj.is_empty() {
                return Err(AppError::bad_request(
                    "Update requires non-empty where clause",
                ));
            }
            let data = params
                .get("data")
                .and_then(|v| v.as_object())
                .ok_or_else(|| AppError::bad_request("Missing data for update"))?;

            if let Some(allowed) = &perm.columns {
                if allowed != &["*".to_string()] {
                    for k in data.keys() {
                        if !allowed.contains(k) {
                            return Err(AppError::bad_request(format!(
                                "Column '{}' is not allowed for update",
                                k
                            )));
                        }
                    }
                }
            }
            for (name, v) in data {
                if let Some(cdef) = cols_def.get(name) {
                    validate_array_value(name, cdef, v)?;
                }
            }

            let mut set_parts = Vec::new();
            let mut vals = Vec::new();
            for (i, (k, v)) in data.iter().enumerate() {
                set_parts.push(format!("\"{}\" = ${}", k, i + 1));
                vals.push(v.clone());
            }
            let mut idx = vals.len();
            let mut where_parts = Vec::new();
            for (k, v) in where_obj {
                idx += 1;
                where_parts.push(format!("\"{}\" = ${}", k, idx));
                vals.push(v.clone());
            }
            for (k, v) in perm.filters {
                idx += 1;
                where_parts.push(format!("\"{}\" = ${}", k, idx));
                vals.push(v);
            }
            let sql = format!(
                "UPDATE \"{}\" SET {} WHERE {}",
                table,
                set_parts.join(", "),
                where_parts.join(" AND ")
            );
            let result = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
                .execute(&pool)
                .await
                .map_err(|e| AppError::internal(e.to_string()))?;
            Ok(serde_json::json!({"affected": result.rows_affected()}))
        }
        "delete" => {
            let where_obj = params
                .get("where")
                .and_then(|v| v.as_object())
                .ok_or_else(|| AppError::bad_request("Delete requires where clause"))?;
            if where_obj.is_empty() {
                return Err(AppError::bad_request(
                    "Delete requires non-empty where clause",
                ));
            }
            let mut vals = Vec::new();
            let mut where_parts = Vec::new();
            let mut idx = 0;
            for (k, v) in where_obj {
                idx += 1;
                where_parts.push(format!("\"{}\" = ${}", k, idx));
                vals.push(v.clone());
            }
            for (k, v) in perm.filters {
                idx += 1;
                where_parts.push(format!("\"{}\" = ${}", k, idx));
                vals.push(v);
            }
            let sql = format!(
                "DELETE FROM \"{}\" WHERE {}",
                table,
                where_parts.join(" AND ")
            );
            let result = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
                .execute(&pool)
                .await
                .map_err(|e| AppError::internal(e.to_string()))?;
            Ok(serde_json::json!({"affected": result.rows_affected()}))
        }
        _ => Err(AppError::bad_request("Unknown CRUD operation")),
    }
}

#[derive(Default, Deserialize)]
struct LogicMeta {
    auth: Option<String>,
    roles: Option<Vec<String>>,
    params: Option<HashMap<String, LogicParamSpec>>,
    condition: Option<String>,
}

#[derive(Default, Deserialize)]
struct LogicParamSpec {
    #[serde(rename = "type")]
    param_type: Option<String>,
    required: Option<bool>,
    default: Option<Value>,
}

struct LogicDoc {
    meta: LogicMeta,
    sql: String,
}

fn parse_logic(raw: &str) -> Result<LogicDoc> {
    let mut lines = raw.lines();
    let mut meta = LogicMeta::default();
    let mut sql = raw.to_string();
    if lines.next().map(|l| l.trim() == "---") == Some(true) {
        let mut m = Vec::new();
        for line in lines.by_ref() {
            if line.trim() == "---" {
                break;
            }
            m.push(line);
        }
        let mtxt = m.join("\n");
        if !mtxt.trim().is_empty() {
            meta = serde_yaml::from_str(&mtxt)
                .map_err(|e| AppError::bad_request(format!("Invalid logic frontmatter: {}", e)))?;
        }
        sql = lines.collect::<Vec<_>>().join("\n");
    }
    Ok(LogicDoc { meta, sql })
}

fn validate_param_type(t: &str, v: &Value) -> bool {
    match t {
        "string" => v.is_string(),
        "int" => v.is_i64() || v.is_u64(),
        "float" => v.is_f64() || v.is_i64() || v.is_u64(),
        "bool" | "boolean" => v.is_boolean(),
        _ => true,
    }
}

fn resolve_logic_params(meta: &LogicMeta, params: Value) -> Result<HashMap<String, Value>> {
    let mut out = match params {
        Value::Null => HashMap::new(),
        Value::Object(o) => o.into_iter().collect(),
        _ => return Err(AppError::bad_request("Logic params must be an object")),
    };

    if let Some(specs) = &meta.params {
        for (k, spec) in specs {
            if !out.contains_key(k) {
                if let Some(d) = &spec.default {
                    out.insert(k.clone(), d.clone());
                } else if spec.required.unwrap_or(false) {
                    return Err(AppError::bad_request(format!(
                        "Missing required param: {}",
                        k
                    )));
                }
            }
            if let Some(v) = out.get(k) {
                if let Some(t) = &spec.param_type {
                    if !validate_param_type(t, v) {
                        return Err(AppError::bad_request(format!(
                            "Invalid type for param: {}",
                            k
                        )));
                    }
                }
            }
        }
    }

    Ok(out)
}

fn enforce_logic_auth(meta: &LogicMeta, p: &Principal) -> Result<()> {
    let auth = meta.auth.as_deref().unwrap_or("authenticated");
    if auth != "public" && matches!(p, Principal::Anonymous) {
        return Err(AppError::unauthorized("Authentication required"));
    }
    if let Some(roles) = &meta.roles {
        let owned = principal_roles(p);
        if !roles.iter().any(|r| owned.iter().any(|o| o == r)) {
            return Err(AppError::forbidden("Insufficient roles"));
        }
    }
    Ok(())
}

fn eval_logic_condition(
    meta: &LogicMeta,
    p: &Principal,
    params: &HashMap<String, Value>,
) -> Result<()> {
    let Some(cond) = meta.condition.as_deref() else {
        return Ok(());
    };
    if cond.contains("resource.") {
        return Err(AppError::bad_request(
            "unsupported CEL identifier in logic condition: resource.*",
        ));
    }
    let Some((left, right)) = cond.split_once("==") else {
        return Err(AppError::bad_request("invalid logic condition"));
    };
    let resolve = |tok: &str, p: &Principal, params: &HashMap<String, Value>| -> Result<Value> {
        let t = tok.trim();
        if let Some(name) = t.strip_prefix("request.params.") {
            return Ok(params.get(name).cloned().unwrap_or(Value::Null));
        }
        if t == "request.auth.sub" {
            let s = match p {
                Principal::EndUser { sub, .. } => sub.clone(),
                Principal::ApiKey { key_id, .. } => key_id.clone(),
                Principal::Anonymous => "".to_string(),
            };
            return Ok(Value::String(s));
        }
        if t.starts_with('"') && t.ends_with('"') {
            return Ok(Value::String(t.trim_matches('"').to_string()));
        }
        Err(AppError::bad_request("unsupported logic condition token"))
    };
    let l = resolve(left, p, params)?;
    let r = resolve(right, p, params)?;
    if l == r {
        Ok(())
    } else {
        Err(AppError::forbidden("Condition failed"))
    }
}

fn build_logic_sql(
    sql: &str,
    p: &Principal,
    params: &HashMap<String, Value>,
) -> Result<(String, Vec<Value>)> {
    let mut out = String::new();
    let mut names = Vec::new();
    let mut chars = sql.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == ':' {
            if chars.peek() == Some(&':') {
                out.push(':');
                out.push(':');
                chars.next();
                continue;
            }
            let mut name = String::new();
            while let Some(c) = chars.peek().copied() {
                if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                    name.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            names.push(name);
            out.push('$');
            out.push_str(&names.len().to_string());
        } else {
            out.push(ch);
        }
    }
    let mut vals = Vec::new();
    for name in names {
        if name == "auth.sub" {
            let sub = match p {
                Principal::EndUser { sub, .. } => sub.clone(),
                Principal::ApiKey { key_id, .. } => key_id.clone(),
                Principal::Anonymous => "".to_string(),
            };
            vals.push(Value::String(sub));
        } else if let Some(v) = params.get(&name) {
            vals.push(v.clone());
        } else {
            return Err(AppError::bad_request(format!(
                "Missing param binding: {}",
                name
            )));
        }
    }
    Ok((out, vals))
}

async fn handle_logic(
    release: &ReleasePayload,
    principal: &Principal,
    name: &str,
    params: Value,
) -> Result<Value> {
    let raw = release
        .logics
        .get(name)
        .ok_or_else(|| AppError::not_found(format!("Logic not found: {}", name)))?;
    let doc = parse_logic(raw)?;
    enforce_logic_auth(&doc.meta, principal)?;
    let p = resolve_logic_params(&doc.meta, params)?;
    eval_logic_condition(&doc.meta, principal, &p)?;

    let conn = release
        .connections
        .get("main")
        .ok_or_else(|| AppError::internal("main connection missing"))?;
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect(&conn.db_url)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    let (sql, vals) = build_logic_sql(&doc.sql, principal, &p)?;
    let lower = sql.trim_start().to_lowercase();
    if lower.starts_with("select") || lower.starts_with("with") || lower.contains("returning") {
        let rows = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
            .fetch_all(&pool)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        let data = rows.into_iter().map(row_to_json).collect::<Vec<_>>();
        Ok(serde_json::json!({"data": data}))
    } else {
        let r = bind_values(sqlx::query::<sqlx::Postgres>(&sql), vals)
            .execute(&pool)
            .await
            .map_err(|e| AppError::internal(e.to_string()))?;
        Ok(serde_json::json!({"affected": r.rows_affected()}))
    }
}

fn bind_values<'a>(
    mut q: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    vals: Vec<Value>,
) -> sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments> {
    for v in vals {
        q = match v {
            Value::Null => {
                let vv: Option<String> = None;
                q.bind(vv)
            }
            Value::Bool(b) => q.bind(b),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q.bind(i)
                } else if let Some(f) = n.as_f64() {
                    q.bind(f)
                } else {
                    q.bind(n.to_string())
                }
            }
            Value::String(s) => q.bind(s),
            Value::Array(arr) => {
                if arr.iter().all(|item| item.is_string()) {
                    let out: Vec<String> = arr
                        .into_iter()
                        .filter_map(|item| item.as_str().map(ToString::to_string))
                        .collect();
                    q.bind(out)
                } else if arr.iter().all(|item| item.is_i64() || item.is_u64()) {
                    let mut out: Vec<i64> = Vec::with_capacity(arr.len());
                    for item in arr {
                        if let Some(v) = item.as_i64() {
                            out.push(v);
                        } else if let Some(v) = item.as_u64() {
                            out.push(v as i64);
                        }
                    }
                    q.bind(out)
                } else {
                    q.bind(sqlx::types::Json(Value::Array(arr)))
                }
            }
            Value::Object(_) => q.bind(sqlx::types::Json(v)),
        };
    }
    q
}

fn row_to_json(row: sqlx::postgres::PgRow) -> Value {
    let mut out = serde_json::Map::new();
    for c in row.columns() {
        let n = c.name();
        let v = row
            .try_get::<Option<String>, _>(n)
            .ok()
            .flatten()
            .map(Value::String)
            .or_else(|| {
                row.try_get::<Option<i64>, _>(n)
                    .ok()
                    .flatten()
                    .map(|x| Value::Number(x.into()))
            })
            .or_else(|| {
                row.try_get::<Option<f64>, _>(n)
                    .ok()
                    .flatten()
                    .and_then(|f| serde_json::Number::from_f64(f).map(Value::Number))
            })
            .or_else(|| {
                row.try_get::<Option<bool>, _>(n)
                    .ok()
                    .flatten()
                    .map(Value::Bool)
            })
            .unwrap_or(Value::Null);
        out.insert(n.to_string(), v);
    }
    Value::Object(out)
}
