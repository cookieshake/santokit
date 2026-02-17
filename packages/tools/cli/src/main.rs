use std::collections::HashMap;
use std::env;

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
