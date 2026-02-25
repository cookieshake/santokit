use std::collections::HashMap;
use std::env;
use std::path::Path;

use anyhow::{Context, anyhow};
use serde_json::Value;

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
            let body: Value = req.send().await?.json().await?;
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

async fn get_current_release(
    client: &reqwest::Client,
    hub: &str,
    project: &str,
    env_name: &str,
) -> anyhow::Result<Value> {
    let url = format!(
        "{}/internal/releases/{}/{}/current",
        hub, project, env_name
    );
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

fn ts_type_from_column(col: &Value) -> &'static str {
    match col.get("type").and_then(|v| v.as_str()).unwrap_or("string") {
        "string" | "file" => "string",
        "int" | "integer" | "float" | "number" => "number",
        "bool" | "boolean" => "boolean",
        "timestamp" | "datetime" => "string",
        "array" => "unknown[]",
        _ => "unknown",
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

    out.push_str("type CallResult<T> = Promise<{ data: T }>\n\n");

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

        out.push_str(&format!("export interface {}Row {{\n", iface));
        out.push_str(&format!("  {}: string\n", id_name));
        for (col_name, col_def) in &cols {
            let ts = ts_type_from_column(col_def);
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
            out.push_str(&format!("  {}?: string\n", id_name));
        } else {
            out.push_str(&format!("  {}: string\n", id_name));
        }
        for (col_name, col_def) in &cols {
            let ts = ts_type_from_column(col_def);
            let nullable = col_def
                .get("nullable")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let has_default = col_def.get("default").is_some();
            let optional = nullable || has_default;
            if optional {
                out.push_str(&format!("  {}?: {}\n", col_name, ts));
            } else {
                out.push_str(&format!("  {}: {}\n", col_name, ts));
            }
        }
        out.push_str("}\n\n");
    }

    out.push_str(
        "class TableApi<TRow, TInsert extends Record<string, unknown>> {\n\
  constructor(private readonly call: (path: string, params: Record<string, unknown>) => Promise<any>, private readonly table: string) {}\n\
  select(params: Record<string, unknown> = {}): CallResult<TRow[]> {\n\
    return this.call(`db/${this.table}/select`, params)\n\
  }\n\
  insert(data: TInsert): CallResult<TRow> {\n\
    return this.call(`db/${this.table}/insert`, { data })\n\
  }\n\
  update(where: Record<string, unknown>, data: Partial<TInsert>): CallResult<{ affected: number }> {\n\
    return this.call(`db/${this.table}/update`, { where, data })\n\
  }\n\
  delete(where: Record<string, unknown>): CallResult<{ affected: number }> {\n\
    return this.call(`db/${this.table}/delete`, { where })\n\
  }\n\
}\n\n",
    );

    out.push_str(
        "export interface SantokitClientOptions {\n\
  baseUrl: string\n\
  project: string\n\
  env: string\n\
  getAccessToken?: () => string | undefined\n\
}\n\n",
    );

    out.push_str(
        "export function createClient(options: SantokitClientOptions) {\n\
  const call = async (path: string, params: Record<string, unknown>) => {\n\
    const headers: Record<string, string> = {\n\
      \"Content-Type\": \"application/json\",\n\
      \"X-Santokit-Project\": options.project,\n\
      \"X-Santokit-Env\": options.env,\n\
    }\n\
    const token = options.getAccessToken?.()\n\
    if (token) headers.Authorization = `Bearer ${token}`\n\
    const res = await fetch(`${options.baseUrl}/call`, {\n\
      method: \"POST\",\n\
      headers,\n\
      body: JSON.stringify({ path, params }),\n\
    })\n\
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)\n\
    return res.json()\n\
  }\n\
  return {\n\
    db: {\n",
    );

    for (table_name, _table_def) in schema {
        let iface = to_pascal_case(table_name);
        out.push_str(&format!(
            "      {}: new TableApi<{}Row, {}Insert>(call, \"{}\"),\n",
            table_name, iface, iface, table_name
        ));
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
        return Err(anyhow!("request failed: {}", resp.status()));
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
