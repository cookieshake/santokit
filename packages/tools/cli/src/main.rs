use std::collections::HashMap;
use std::convert::Infallible;
use std::env;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, anyhow};
use axum::Router;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::get;
use futures::{Stream, stream};
use serde::Deserialize;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        return Err(anyhow!("usage: stk <command>"));
    }

    let hub = env::var("STK_HUB_URL").unwrap_or_else(|_| "http://hub:4000".to_string());
    let token = env::var("STK_AUTH_TOKEN").ok();
    let client = reqwest::Client::new();

    match args[1].as_str() {
        "project" if args.get(2).map(|s| s.as_str()) == Some("create") => {
            let project = args.get(3).context("missing project")?;
            post_auth(
                &client,
                &hub,
                "/api/projects",
                token.as_deref(),
                serde_json::json!({"project":project}),
            )
            .await?;
        }
        "org" if args.get(2).map(|s| s.as_str()) == Some("invite") => {
            let email = args.get(3).context("missing email")?;
            let role = get_flag(&args, "--role").context("missing --role")?;
            post_auth(
                &client,
                &hub,
                "/api/org/invite",
                token.as_deref(),
                serde_json::json!({"email": email, "role": role}),
            )
            .await?;
        }
        "org"
            if args.get(2).map(|s| s.as_str()) == Some("members")
                && args.get(3).map(|s| s.as_str()) == Some("set-role") =>
        {
            let user = args.get(4).context("missing user")?;
            let role = get_flag(&args, "--role").context("missing --role")?;
            post_auth(
                &client,
                &hub,
                "/api/org/members/set-role",
                token.as_deref(),
                serde_json::json!({"user": user, "role": role}),
            )
            .await?;
        }
        "org" if args.get(2).map(|s| s.as_str()) == Some("remove") => {
            let user = args.get(3).context("missing user")?;
            post_auth(
                &client,
                &hub,
                "/api/org/remove",
                token.as_deref(),
                serde_json::json!({"user": user}),
            )
            .await?;
        }
        "project" if args.get(2).map(|s| s.as_str()) == Some("invite") => {
            let email = args.get(3).context("missing email")?;
            let role = get_flag(&args, "--role").context("missing --role")?;
            let project = get_flag(&args, "--project")
                .or_else(|| env::var("STK_PROJECT").ok())
                .context("missing --project (or STK_PROJECT)")?;
            post_auth(
                &client,
                &hub,
                "/api/project/invite",
                token.as_deref(),
                serde_json::json!({"project": project, "email": email, "role": role}),
            )
            .await?;
        }
        "project"
            if args.get(2).map(|s| s.as_str()) == Some("members")
                && args.get(3).map(|s| s.as_str()) == Some("set-role") =>
        {
            let user = args.get(4).context("missing user")?;
            let role = get_flag(&args, "--role").context("missing --role")?;
            let project = get_flag(&args, "--project")
                .or_else(|| env::var("STK_PROJECT").ok())
                .context("missing --project (or STK_PROJECT)")?;
            post_auth(
                &client,
                &hub,
                "/api/project/members/set-role",
                token.as_deref(),
                serde_json::json!({"project": project, "user": user, "role": role}),
            )
            .await?;
        }
        "project" if args.get(2).map(|s| s.as_str()) == Some("remove") => {
            let user = args.get(3).context("missing user")?;
            let project = get_flag(&args, "--project")
                .or_else(|| env::var("STK_PROJECT").ok())
                .context("missing --project (or STK_PROJECT)")?;
            post_auth(
                &client,
                &hub,
                "/api/project/remove",
                token.as_deref(),
                serde_json::json!({"project": project, "user": user}),
            )
            .await?;
        }
        "env" if args.get(2).map(|s| s.as_str()) == Some("create") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = args.last().context("missing env name")?;
            post_auth(
                &client,
                &hub,
                "/api/envs",
                token.as_deref(),
                serde_json::json!({"project":project, "env":env_name}),
            )
            .await?;
        }
        "connections" if args.get(2).map(|s| s.as_str()) == Some("set") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let name = get_flag(&args, "--name").context("missing --name")?;
            let engine = get_flag(&args, "--engine").context("missing --engine")?;
            let db_url = get_flag(&args, "--db-url").context("missing --db-url")?;
            post_auth(
                &client,
                &hub,
                "/api/connections/set",
                token.as_deref(),
                serde_json::json!({"project":project,"env":env_name,"name":name,"engine":engine,"db_url":db_url}),
            )
            .await?;
        }
        "connections" if args.get(2).map(|s| s.as_str()) == Some("test") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let name = get_flag(&args, "--name").context("missing --name")?;
            post_auth(
                &client,
                &hub,
                "/api/connections/test",
                token.as_deref(),
                serde_json::json!({"project":project,"env":env_name,"name":name}),
            )
            .await?;
        }
        "apply" => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let r = get_flag(&args, "--ref").context("missing --ref")?;
            let schema = read_schema_files()?;
            let permissions = read_file_if_exists("config/permissions.yaml")?;
            let storage = read_file_if_exists("config/storage.yaml")?;
            let logics = read_logics_files()?;
            post_auth(
                &client,
                &hub,
                "/api/apply",
                token.as_deref(),
                serde_json::json!({
                    "project": project,
                    "env": env_name,
                    "ref": r,
                    "schema": schema,
                    "permissions": permissions,
                    "storage": storage,
                    "logics": logics,
                }),
            )
            .await?;
        }
        "apikey" if args.get(2).map(|s| s.as_str()) == Some("create") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let name = get_flag(&args, "--name").context("missing --name")?;
            let roles = get_flag(&args, "--roles").context("missing --roles")?;
            let roles_vec = roles
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>();
            let body = post_auth(
                &client,
                &hub,
                "/api/apikeys/create",
                token.as_deref(),
                serde_json::json!({"project":project,"env":env_name,"name":name,"roles":roles_vec}),
            )
            .await?;
            if let Some(api_key) = body.get("api_key").and_then(|v| v.as_str()) {
                println!("API Key (store securely): {}", api_key);
            }
        }
        "apikey" if args.get(2).map(|s| s.as_str()) == Some("list") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let url = format!(
                "{}/api/apikeys/list?project={}&env={}",
                hub, project, env_name
            );
            let mut req = client.get(url);
            if let Some(t) = token.as_deref() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            let resp = req.send().await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    let message = parsed
                        .get("error")
                        .and_then(|v| v.get("message"))
                        .and_then(|v| v.as_str())
                        .or_else(|| parsed.get("message").and_then(|v| v.as_str()))
                        .unwrap_or("request failed");
                    return Err(anyhow!("request failed: {} ({})", status, message));
                }
                if text.is_empty() {
                    return Err(anyhow!("request failed: {}", status));
                }
                return Err(anyhow!("request failed: {} ({})", status, text));
            }
            let body: Value = resp.json().await?;
            if let Some(arr) = body.as_array() {
                for item in arr {
                    if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                        println!("{}", name);
                    }
                }
            }
        }
        "apikey" if args.get(2).map(|s| s.as_str()) == Some("revoke") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let env_name = get_flag(&args, "--env").context("missing --env")?;
            let key_id = get_flag(&args, "--key-id").context("missing --key-id")?;
            post_auth(
                &client,
                &hub,
                "/api/apikeys/revoke",
                token.as_deref(),
                serde_json::json!({"project":project,"env":env_name,"key_id":key_id}),
            )
            .await?;
        }
        "release" if args.get(2).map(|s| s.as_str()) == Some("promote") => {
            let project = get_flag(&args, "--project").context("missing --project")?;
            let from = get_flag(&args, "--from").context("missing --from")?;
            let to = get_flag(&args, "--to").context("missing --to")?;
            post_auth(
                &client,
                &hub,
                "/api/releases/promote",
                token.as_deref(),
                serde_json::json!({"project":project,"from":from,"to":to}),
            )
            .await?;
        }
        "schema" if args.get(2).map(|s| s.as_str()) == Some("snapshot") => {
            println!("snapshot ok");
        }
        "gen" if args.get(2).map(|s| s.as_str()) == Some("client") => {
            let lang = get_flag(&args, "--lang").context("missing --lang")?;
            if lang != "typescript" {
                return Err(anyhow!("unsupported language: {}", lang));
            }
            let output = get_flag(&args, "--output").context("missing --output")?;
            let project = get_flag(&args, "--project")
                .or_else(|| env::var("STK_PROJECT").ok())
                .context("missing --project (or STK_PROJECT)")?;
            let env_name = get_flag(&args, "--env")
                .or_else(|| env::var("STK_ENV").ok())
                .unwrap_or_else(|| "dev".to_string());

            let release = get_current_release(&client, &hub, &project, &env_name).await?;
            let rendered = render_typescript_client(&release)?;
            write_output(&output, &rendered)?;
            println!("generated {}", output);
        }
        "mcp" if args.get(2).map(|s| s.as_str()) == Some("run") => {
            let mcp_context = resolve_mcp_context()?;
            let release = load_mcp_release(&client, &mcp_context).await?;
            run_mcp_stdio(release, mcp_context).await?;
        }
        "mcp" if args.get(2).map(|s| s.as_str()) == Some("start") => {
            let port = get_flag(&args, "--port")
                .map(|p| p.parse::<u16>().context("invalid --port"))
                .transpose()?
                .unwrap_or(8080);
            let mcp_context = resolve_mcp_context()?;
            let _release = load_mcp_release(&client, &mcp_context).await?;
            run_mcp_sse(port).await?;
        }
        other => {
            return Err(anyhow!("unsupported command: {}", other));
        }
    }

    Ok(())
}

fn get_flag(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

#[derive(Debug, Default, Deserialize)]
struct RepoContext {
    #[serde(rename = "hubUrl")]
    hub_url: Option<String>,
    project: Option<String>,
    env: Option<String>,
}

#[derive(Debug, Clone)]
struct McpContext {
    hub: String,
    project: String,
    env_name: String,
    operator_token: Option<String>,
}

#[derive(Default, Deserialize)]
struct LogicMeta {
    auth: Option<String>,
    roles: Option<Vec<String>>,
    params: Option<HashMap<String, LogicParamSpec>>,
}

#[derive(Default, Deserialize)]
struct LogicParamSpec {
    #[serde(rename = "type")]
    param_type: Option<String>,
    required: Option<bool>,
}

struct LogicDoc {
    meta: LogicMeta,
    sql: String,
}

fn load_repo_context() -> anyhow::Result<RepoContext> {
    let path = Path::new(".stk/context.json");
    if !path.exists() {
        return Ok(RepoContext::default());
    }
    let raw = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw).context("invalid .stk/context.json")?)
}

fn resolve_mcp_context() -> anyhow::Result<McpContext> {
    let repo = load_repo_context()?;
    let project = env::var("STK_PROJECT").ok().or(repo.project);
    let env_name = env::var("STK_ENV").ok().or(repo.env);
    let hub = env::var("STK_HUB_URL")
        .ok()
        .or(repo.hub_url)
        .unwrap_or_else(|| "http://hub:4000".to_string());

    let project = project.context("context not set: project")?;
    let env_name = env_name.context("context not set: env")?;
    Ok(McpContext {
        hub,
        project,
        env_name,
        operator_token: env::var("STK_AUTH_TOKEN").ok(),
    })
}

async fn load_mcp_release(client: &reqwest::Client, context: &McpContext) -> anyhow::Result<Value> {
    get_current_release(client, &context.hub, &context.project, &context.env_name)
        .await
        .map_err(|err| anyhow!("failed to initialize mcp server: {}", err))
}

async fn run_mcp_stdio(release: Value, context: McpContext) -> anyhow::Result<()> {
    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(response) = handle_jsonrpc_line(line, &release, &context) {
            stdout.write_all(response.to_string().as_bytes()).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
    }

    Ok(())
}

fn handle_jsonrpc_line(line: &str, release: &Value, context: &McpContext) -> Option<Value> {
    let parsed: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(_) => {
            return Some(jsonrpc_error(Value::Null, -32700, "Parse error"));
        }
    };

    let has_id = parsed.get("id").is_some();
    let id = parsed.get("id").cloned().unwrap_or(Value::Null);
    let method = match parsed.get("method").and_then(|m| m.as_str()) {
        Some(name) => name,
        None => {
            if !has_id {
                return None;
            }
            return Some(jsonrpc_error(id, -32600, "Invalid Request"));
        }
    };

    let response = match method {
        "initialize" => jsonrpc_result(
            id,
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "santokit",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "tools": {}
                }
            }),
        ),
        "ping" => jsonrpc_result(id, serde_json::json!({})),
        "tools/list" => jsonrpc_result(id, serde_json::json!({"tools": mcp_tools()})),
        "tools/call" => handle_mcp_tools_call(id, &parsed, release, context),
        _ => jsonrpc_error(id, -32601, "Method not found"),
    };

    if !has_id {
        return None;
    }
    Some(response)
}

fn mcp_tools() -> Value {
    serde_json::json!([
        {
            "name": "schema_list_tables",
            "description": "List all tables in current release schema",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "schema_get_table",
            "description": "Get details for a table in current release schema",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "table": { "type": "string" }
                },
                "required": ["table"],
                "additionalProperties": false
            }
        },
        {
            "name": "permissions_get_table",
            "description": "Get table permission rules from current release",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "table": { "type": "string" }
                },
                "required": ["table"],
                "additionalProperties": false
            }
        },
        {
            "name": "release_current",
            "description": "Get current release identifier and context",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "logic_list",
            "description": "List available custom SQL logics",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "logic_get",
            "description": "Get SQL and metadata for one logic",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" }
                },
                "required": ["name"],
                "additionalProperties": false
            }
        }
    ])
}

fn handle_mcp_tools_call(
    id: Value,
    request: &Value,
    release: &Value,
    context: &McpContext,
) -> Value {
    let params = request.get("params").and_then(|v| v.as_object());
    let Some(params) = params else {
        return jsonrpc_error(id, -32602, "Invalid params");
    };
    let Some(name) = params.get("name").and_then(|v| v.as_str()) else {
        return jsonrpc_error(id, -32602, "Invalid params");
    };
    let args = params
        .get("arguments")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let tool_name = name.to_string();
    let call_id = id.clone();
    let release_snapshot = release.clone();
    let context_snapshot = context.clone();
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        if let Some(delay_ms) = env::var("STK_MCP_TEST_DELAY_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
        {
            if delay_ms > 0 {
                thread::sleep(Duration::from_millis(delay_ms));
            }
        }
        let response = execute_mcp_tool_call(
            call_id,
            &tool_name,
            &args,
            &release_snapshot,
            &context_snapshot,
        );
        let _ = tx.send(sanitize_mcp_payload(response));
    });

    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(response) => response,
        Err(_) => jsonrpc_error(id, -32008, "TIMEOUT: tool execution exceeded 5s limit"),
    }
}

fn execute_mcp_tool_call(
    id: Value,
    name: &str,
    args: &serde_json::Map<String, Value>,
    release: &Value,
    context: &McpContext,
) -> Value {
    if !is_project_viewer_or_higher(context) {
        return jsonrpc_error(
            id,
            -32003,
            "FORBIDDEN: insufficient role: project:viewer required",
        );
    }

    match name {
        "schema_list_tables" => match schema_list_tables(release) {
            Ok(result) => jsonrpc_result(id, result),
            Err(err) => jsonrpc_error(id, -32000, &format!("INTERNAL_ERROR: {}", err)),
        },
        "schema_get_table" => {
            let Some(table_name) = args.get("table").and_then(|v| v.as_str()) else {
                return jsonrpc_error(id, -32602, "Invalid params: table is required");
            };
            match schema_get_table(release, table_name) {
                Ok(result) => jsonrpc_result(id, result),
                Err(err) => jsonrpc_error(id, -32004, &format!("NOT_FOUND: {}", err)),
            }
        }
        "permissions_get_table" => {
            let Some(table_name) = args.get("table").and_then(|v| v.as_str()) else {
                return jsonrpc_error(id, -32602, "Invalid params: table is required");
            };
            match permissions_get_table(release, table_name) {
                Ok(result) => jsonrpc_result(id, result),
                Err(err) => jsonrpc_error(id, -32004, &format!("NOT_FOUND: {}", err)),
            }
        }
        "release_current" => jsonrpc_result(id, release_current(release, context)),
        "logic_list" => match logic_list(release) {
            Ok(result) => jsonrpc_result(id, result),
            Err(err) => jsonrpc_error(id, -32000, &format!("INTERNAL_ERROR: {}", err)),
        },
        "logic_get" => {
            let Some(logic_name) = args.get("name").and_then(|v| v.as_str()) else {
                return jsonrpc_error(id, -32602, "Invalid params: name is required");
            };
            match logic_get(release, logic_name) {
                Ok(result) => jsonrpc_result(id, result),
                Err(err) => jsonrpc_error(id, -32004, &format!("NOT_FOUND: {}", err)),
            }
        }
        _ => jsonrpc_error(id, -32601, "Method not found"),
    }
}

fn sanitize_mcp_payload(payload: Value) -> Value {
    sanitize_value(payload)
}

fn sanitize_value(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(sanitize_value).collect()),
        Value::Object(obj) => {
            let mut out = serde_json::Map::new();
            for (key, val) in obj {
                if is_sensitive_key(&key) {
                    out.insert(key, Value::String("[REDACTED]".to_string()));
                } else {
                    out.insert(key, sanitize_value(val));
                }
            }
            Value::Object(out)
        }
        Value::String(s) => Value::String(sanitize_string(&s)),
        _ => value,
    }
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "db_url"
            | "api_key"
            | "access_token"
            | "refresh_token"
            | "service_token"
            | "authorization"
            | "cookie"
    )
}

fn sanitize_string(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("postgres://")
        || lower.contains("mysql://")
        || lower.contains("mongodb://")
        || lower.starts_with("bearer ")
        || lower.starts_with("sk_")
    {
        "[REDACTED]".to_string()
    } else {
        raw.to_string()
    }
}

fn is_project_viewer_or_higher(context: &McpContext) -> bool {
    matches!(context.operator_token.as_deref(), Some("operator-token"))
}

fn release_tables(release: &Value) -> anyhow::Result<&serde_json::Map<String, Value>> {
    release
        .get("schema")
        .and_then(|v| v.get("tables"))
        .and_then(|v| v.as_object())
        .context("release schema.tables is missing")
}

fn schema_list_tables(release: &Value) -> anyhow::Result<Value> {
    let tables = release_tables(release)?;
    let mut names = tables.keys().cloned().collect::<Vec<_>>();
    names.sort();
    let items = names
        .into_iter()
        .filter_map(|name| {
            let table = tables.get(&name)?;
            let connection = table
                .get("connection")
                .and_then(|v| v.as_str())
                .unwrap_or("main");
            Some(serde_json::json!({"name": name, "connection": connection}))
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({"tables": items}))
}

fn schema_get_table(release: &Value, table_name: &str) -> anyhow::Result<Value> {
    let tables = release_tables(release)?;
    let table = tables
        .get(table_name)
        .ok_or_else(|| anyhow!("table '{}' not found", table_name))?;
    let connection = table
        .get("connection")
        .and_then(|v| v.as_str())
        .unwrap_or("main");

    let id_name = table
        .get("id")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("id");
    let id_generate = table
        .get("id")
        .and_then(|v| v.get("generate"))
        .and_then(|v| v.as_str())
        .unwrap_or("ulid");
    let id_type = table
        .get("id")
        .and_then(|v| v.get("type"))
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| {
            if id_generate == "auto_increment" {
                "bigint"
            } else {
                "string"
            }
        });

    let cols = table
        .get("columns")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let mut col_names = cols.keys().cloned().collect::<Vec<_>>();
    col_names.sort();

    let mut columns = Vec::new();
    let mut foreign_keys = Vec::new();
    for col_name in col_names {
        let Some(col) = cols.get(&col_name) else {
            continue;
        };
        let col_type = col.get("type").and_then(|v| v.as_str()).unwrap_or("string");
        let nullable = col
            .get("nullable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        columns.push(serde_json::json!({
            "name": col_name,
            "type": col_type,
            "nullable": nullable
        }));

        if let Some(references) = col.get("references").and_then(|v| v.as_object()) {
            if let Some(ref_table) = references.get("table").and_then(|v| v.as_str()) {
                let ref_column = references
                    .get("column")
                    .and_then(|v| v.as_str())
                    .unwrap_or("id");
                foreign_keys.push(serde_json::json!({
                    "column": col_name,
                    "references": {
                        "table": ref_table,
                        "column": ref_column
                    }
                }));
            }
        }
    }

    Ok(serde_json::json!({
        "name": table_name,
        "connection": connection,
        "primaryKey": {
            "name": id_name,
            "type": id_type
        },
        "columns": columns,
        "foreignKeys": foreign_keys
    }))
}

fn permissions_get_table(release: &Value, table_name: &str) -> anyhow::Result<Value> {
    let _ = release_tables(release)?
        .get(table_name)
        .ok_or_else(|| anyhow!("table '{}' not found", table_name))?;
    let ops = ["select", "insert", "update", "delete"];
    let mut rules = serde_json::Map::new();
    let table_rules = release
        .get("permissions")
        .and_then(|v| v.get("tables"))
        .and_then(|v| v.get(table_name));
    for op in ops {
        let normalized = parse_permission_rules(table_rules.and_then(|v| v.get(op)));
        rules.insert(op.to_string(), Value::Array(normalized));
    }
    Ok(serde_json::json!({"table": table_name, "rules": rules}))
}

fn parse_permission_rules(raw: Option<&Value>) -> Vec<Value> {
    let list = match raw {
        Some(v) if v.is_array() => v.as_array().cloned().unwrap_or_default(),
        Some(v) if v.is_object() => vec![v.clone()],
        _ => vec![],
    };
    list.into_iter()
        .map(|rule| {
            let roles = rule
                .get("roles")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.as_str().map(|s| Value::String(s.to_string())))
                .collect::<Vec<_>>();
            let mut item = serde_json::Map::new();
            item.insert("roles".to_string(), Value::Array(roles));
            item.insert("allow".to_string(), Value::Bool(true));
            if let Some(cond) = rule.get("condition").and_then(|v| v.as_str()) {
                item.insert("condition".to_string(), Value::String(cond.to_string()));
            }
            if let Some(columns) = rule.get("columns").and_then(|v| v.as_array()) {
                let cols = columns
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| Value::String(s.to_string())))
                    .collect::<Vec<_>>();
                item.insert("columns".to_string(), Value::Array(cols));
            }
            Value::Object(item)
        })
        .collect()
}

fn release_current(release: &Value, context: &McpContext) -> Value {
    let release_id = release
        .get("release_id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    serde_json::json!({
        "releaseId": release_id,
        "project": context.project,
        "env": context.env_name
    })
}

fn logic_list(release: &Value) -> anyhow::Result<Value> {
    let logics = release
        .get("logics")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let mut names = logics.keys().cloned().collect::<Vec<_>>();
    names.sort();
    Ok(serde_json::json!({"logics": names}))
}

fn logic_get(release: &Value, name: &str) -> anyhow::Result<Value> {
    let logics = release
        .get("logics")
        .and_then(|v| v.as_object())
        .ok_or_else(|| anyhow!("logic '{}' not found", name))?;
    let raw = logics
        .get(name)
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("logic '{}' not found", name))?;
    let doc = parse_logic_doc(raw)?;
    let params = doc
        .meta
        .params
        .unwrap_or_default()
        .into_iter()
        .map(|(param_name, spec)| {
            serde_json::json!({
                "name": param_name,
                "type": spec.param_type.unwrap_or_else(|| "string".to_string()),
                "required": spec.required.unwrap_or(false)
            })
        })
        .collect::<Vec<_>>();
    let auth_required = doc.meta.auth.as_deref().unwrap_or("authenticated") != "public";
    let auth = serde_json::json!({
        "required": auth_required,
        "roles": doc.meta.roles.unwrap_or_default()
    });
    Ok(serde_json::json!({
        "name": name,
        "sql": doc.sql,
        "params": params,
        "auth": auth
    }))
}

fn parse_logic_doc(raw: &str) -> anyhow::Result<LogicDoc> {
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
            meta = serde_yaml::from_str(&mtxt).context("invalid logic frontmatter")?;
        }
        sql = lines.collect::<Vec<_>>().join("\n");
    }
    Ok(LogicDoc { meta, sql })
}

fn jsonrpc_result(id: Value, result: Value) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn jsonrpc_error(id: Value, code: i64, message: &str) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    })
}

async fn run_mcp_sse(port: u16) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|err| {
        if err.kind() == std::io::ErrorKind::AddrInUse {
            anyhow!("port already in use")
        } else {
            anyhow!("failed to bind port {}: {}", port, err)
        }
    })?;

    let app = Router::new().route("/sse", get(mcp_sse_handler));
    println!("mcp sse listening on {}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn mcp_sse_handler() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let ticker = tokio::time::interval(Duration::from_secs(15));
    let event_stream = stream::unfold(ticker, |mut ticker| async move {
        ticker.tick().await;
        Some((Ok(Event::default().comment("keepalive")), ticker))
    });
    Sse::new(event_stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn get_current_release(
    client: &reqwest::Client,
    hub: &str,
    project: &str,
    env_name: &str,
) -> anyhow::Result<Value> {
    let url = format!("{}/internal/releases/{}/{}/current", hub, project, env_name);
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!(
            "failed to load current release for {}/{}: {}",
            project,
            env_name,
            resp.status()
        ));
    }
    Ok(resp.json().await?)
}

fn write_output(path: &str, content: &str) -> anyhow::Result<()> {
    let out = Path::new(path);
    if let Some(parent) = out.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(out, content)?;
    Ok(())
}

fn map_ts_type_token(token: &str, col_name: &str) -> anyhow::Result<String> {
    let t = token.trim();
    if let Some(inner) = t.strip_prefix("array<").and_then(|s| s.strip_suffix('>')) {
        let inner_ts = map_ts_type_token(inner, col_name)?;
        return Ok(format!("{}[]", inner_ts));
    }
    match t {
        "string" => Ok("string".to_string()),
        "int" | "integer" => Ok("number".to_string()),
        "bigint" => Ok("string".to_string()),
        "float" | "number" => Ok("number".to_string()),
        "decimal" => Ok("string".to_string()),
        "boolean" | "bool" => Ok("boolean".to_string()),
        "json" => Ok("unknown".to_string()),
        "timestamp" | "datetime" => Ok("string".to_string()),
        "bytes" => Ok("string".to_string()),
        "file" => Ok("string".to_string()),
        _ => Err(anyhow!(
            "unknown schema type '{}' for column '{}'",
            t,
            col_name
        )),
    }
}

fn ts_type_from_column(col_name: &str, col: &Value) -> anyhow::Result<String> {
    let raw = col.get("type").and_then(|v| v.as_str()).unwrap_or("string");
    if raw == "array" {
        let item = col
            .get("items")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("array column '{}' is missing items", col_name))?;
        let inner = map_ts_type_token(item, col_name)?;
        Ok(format!("{}[]", inner))
    } else {
        map_ts_type_token(raw, col_name)
    }
}

fn to_pascal_case(s: &str) -> String {
    s.split(['_', '-', ' '])
        .filter(|p| !p.is_empty())
        .map(|p| {
            let mut chars = p.chars();
            let first = chars
                .next()
                .map(|c| c.to_ascii_uppercase().to_string())
                .unwrap_or_default();
            let rest = chars.as_str().to_ascii_lowercase();
            format!("{}{}", first, rest)
        })
        .collect::<Vec<_>>()
        .join("")
}

fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    format!("{}{}", first.to_ascii_lowercase(), chars.as_str())
}

fn render_typescript_client(release: &Value) -> anyhow::Result<String> {
    let release_id = release
        .get("release_id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let schema = release
        .get("schema")
        .and_then(|v| v.get("tables"))
        .and_then(|v| v.as_object())
        .context("release schema.tables is missing")?;

    let mut out = String::new();
    out.push_str("/* eslint-disable */\n");
    out.push_str(&format!("// releaseId: {}\n", release_id));
    out.push_str(&format!(
        "// generatedBy: stk@{}\n\n",
        env!("CARGO_PKG_VERSION")
    ));
    out.push_str(&format!("export const releaseId = \"{}\"\n", release_id));
    out.push_str(&format!(
        "export const generatedBy = \"stk@{}\"\n\n",
        env!("CARGO_PKG_VERSION")
    ));

    out.push_str("type CallEnvelope<T> = Promise<{ data: T }>\n\n");

    for (table_name, table_def) in schema {
        let iface = to_pascal_case(table_name);
        let cols = table_def
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

        let id_type_raw = table_def
            .get("id")
            .and_then(|v| v.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| {
                if id_generate == "auto_increment" {
                    "bigint"
                } else {
                    "string"
                }
            });
        let id_ts = map_ts_type_token(id_type_raw, id_name)?;

        out.push_str(&format!("export interface {}Row {{\n", iface));
        out.push_str(&format!("  {}: {}\n", id_name, id_ts));
        for (col_name, col_def) in &cols {
            let ts = ts_type_from_column(col_name, col_def)?;
            let nullable = col_def
                .get("nullable")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if nullable {
                out.push_str(&format!("  {}: {} | null\n", col_name, ts));
            } else {
                out.push_str(&format!("  {}: {}\n", col_name, ts));
            }
        }
        out.push_str("}\n\n");

        out.push_str(&format!("export interface {}Insert {{\n", iface));
        if id_generate != "none" {
            out.push_str(&format!("  {}?: {}\n", id_name, id_ts));
        } else {
            out.push_str(&format!("  {}: {}\n", id_name, id_ts));
        }
        for (col_name, col_def) in &cols {
            let ts = ts_type_from_column(col_name, col_def)?;
            let nullable = col_def
                .get("nullable")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let has_default = col_def.get("default").is_some();
            let optional = nullable || has_default;
            let ts_with_nullable = if nullable {
                format!("{} | null", ts)
            } else {
                ts
            };
            if optional {
                out.push_str(&format!("  {}?: {}\n", col_name, ts_with_nullable));
            } else {
                out.push_str(&format!("  {}: {}\n", col_name, ts_with_nullable));
            }
        }
        out.push_str("}\n\n");
    }

    out.push_str(
        "class TableApi<TRow extends Record<string, unknown>, TInsert extends Record<string, unknown>> {\n\
  constructor(private readonly call: (path: string, params: Record<string, unknown>) => Promise<any>, private readonly table: string) {}\n\
  async select(params: {\n\
    where?: Partial<TRow>\n\
    orderBy?: Record<string, 'asc' | 'desc'>\n\
    limit?: number\n\
    offset?: number\n\
    expand?: string[]\n\
  } = {}): Promise<TRow[]> {\n\
    const body = await this.call(`db/${this.table}/select`, params as Record<string, unknown>)\n\
    return (body.data?.data ?? body.data ?? []) as TRow[]\n\
  }\n\
  async insert(data: TInsert | TInsert[]): Promise<TRow[]> {\n\
    const payload = Array.isArray(data) ? { values: data } : { data }\n\
    const body = await this.call(`db/${this.table}/insert`, payload)\n\
    if (Array.isArray(body.data)) return body.data as TRow[]\n\
    return [body.data as TRow]\n\
  }\n\
  async update(where: Partial<TRow>, data: Partial<TInsert>): Promise<TRow[]> {\n\
    await this.call(`db/${this.table}/update`, { where, data })\n\
    return this.select({ where })\n\
  }\n\
  async delete(where: Partial<TRow>): Promise<{ affected: number }> {\n\
    const body = await this.call(`db/${this.table}/delete`, { where })\n\
    return body.data as { affected: number }\n\
  }\n\
}\n\n",
    );

    out.push_str(
        "export class SantokitError extends Error {\n\
  code: string\n\
  requestId: string\n\
  constructor(code: string, message: string, requestId: string) {\n\
    super(message)\n\
    this.name = 'SantokitError'\n\
    this.code = code\n\
    this.requestId = requestId\n\
  }\n\
}\n\n",
    );

    out.push_str(
        "export interface SantokitClientOptions {\n\
  baseUrl: string\n\
  project: string\n\
  env: string\n\
  apiKey?: string\n\
  accessToken?: string\n\
}\n\n",
    );

    out.push_str(
        "export function createClient(options: SantokitClientOptions) {\n\
  const hasApiKey = !!options.apiKey\n\
  const hasAccessToken = !!options.accessToken\n\
  if ((hasApiKey && hasAccessToken) || (!hasApiKey && !hasAccessToken)) {\n\
    throw new Error('Exactly one of apiKey or accessToken must be provided')\n\
  }\n\
  const call = async (path: string, params: Record<string, unknown>) => {\n\
    const headers: Record<string, string> = {\n\
      \"Content-Type\": \"application/json\",\n\
      \"X-Santokit-Project\": options.project,\n\
      \"X-Santokit-Env\": options.env,\n\
    }\n\
    if (options.apiKey) headers['X-Santokit-Api-Key'] = options.apiKey\n\
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`\n\
    const res = await fetch(`${options.baseUrl}/call`, {\n\
      method: \"POST\",\n\
      headers,\n\
      body: JSON.stringify({ path, params }),\n\
    })\n\
    if (!res.ok) {\n\
      let payload: any = null\n\
      let rawText = ''\n\
      try {\n\
        rawText = await res.text()\n\
        payload = rawText ? JSON.parse(rawText) : null\n\
      } catch {\n\
        payload = null\n\
      }\n\
      const bodyErr = payload?.error ?? payload\n\
      const code = bodyErr?.code ?? 'INTERNAL_ERROR'\n\
      const message = bodyErr?.message ?? rawText || `Request failed: ${res.status}`\n\
      const requestId = bodyErr?.requestId ?? res.headers.get('x-request-id') ?? ''\n\
      throw new SantokitError(code, message, requestId)\n\
    }\n\
    return res.json()\n\
  }\n\
  return {\n\
    db: {\n",
    );

    for (table_name, _table_def) in schema {
        let iface = to_pascal_case(table_name);
        let camel = to_camel_case(table_name);
        out.push_str(&format!(
            "      {}: new TableApi<{}Row, {}Insert>(call, \"{}\"),\n",
            camel, iface, iface, table_name
        ));
        if camel != *table_name {
            out.push_str(&format!(
                "      \"{}\": new TableApi<{}Row, {}Insert>(call, \"{}\"),\n",
                table_name, iface, iface, table_name
            ));
        }
    }

    out.push_str("    },\n  }\n}\n");
    Ok(out)
}

async fn post_auth(
    client: &reqwest::Client,
    hub: &str,
    path: &str,
    token: Option<&str>,
    body: Value,
) -> anyhow::Result<Value> {
    let mut req = client.post(format!("{}{}", hub, path)).json(&body);
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
            let message = parsed
                .get("error")
                .and_then(|v| v.get("message"))
                .and_then(|v| v.as_str())
                .or_else(|| parsed.get("message").and_then(|v| v.as_str()))
                .unwrap_or("request failed");
            return Err(anyhow!("request failed: {} ({})", status, message));
        }
        if text.is_empty() {
            return Err(anyhow!("request failed: {}", status));
        }
        return Err(anyhow!("request failed: {} ({})", status, text));
    }
    Ok(resp.json().await?)
}

fn read_schema_files() -> anyhow::Result<Vec<String>> {
    let mut out = Vec::new();
    let dir = std::path::Path::new("schema");
    if !dir.exists() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str());
        if ext == Some("yaml") || ext == Some("yml") {
            out.push(std::fs::read_to_string(&path)?);
        }
    }
    Ok(out)
}

fn read_file_if_exists(path: &str) -> anyhow::Result<Option<String>> {
    let p = std::path::Path::new(path);
    if p.exists() {
        Ok(Some(std::fs::read_to_string(p)?))
    } else {
        Ok(None)
    }
}

fn read_logics_files() -> anyhow::Result<Option<HashMap<String, String>>> {
    let dir = std::path::Path::new("logics");
    if !dir.exists() {
        return Ok(None);
    }
    let mut map = HashMap::new();
    for entry in walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("sql") {
            continue;
        }
        let rel = path.strip_prefix(dir).unwrap_or(path);
        let name = rel.with_extension("").to_string_lossy().replace('\\', "/");
        map.insert(name, std::fs::read_to_string(path)?);
    }
    if map.is_empty() {
        Ok(None)
    } else {
        Ok(Some(map))
    }
}
