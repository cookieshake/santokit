//! Apply 명령어
//!
//! 스키마, 권한, 릴리즈를 한 번에 적용합니다.

use crate::config::CliConfig;
use crate::context::EffectiveContext;
use crate::commands::http;
use serde::{Deserialize, Serialize};

pub async fn apply(
    config: &CliConfig,
    ctx: &EffectiveContext,
    git_ref: &str,
    only: Option<String>,
    dry_run: bool,
    force: bool,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    let schema_files = read_schema_files()?;
    let permissions = read_permissions_file()?;
    let storage = read_storage_file()?;
    let logics = read_logics_files()?;

    let only_list = only.as_deref().map(|s| {
        s.split(',')
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .collect::<Vec<String>>()
    });

    #[derive(Serialize)]
    struct ApplyRequest {
        project: String,
        env: String,
        r#ref: String,
        only: Option<Vec<String>>,
        dry_run: bool,
        force: bool,
        schema: Vec<String>,
        permissions: Option<String>,
        storage: Option<String>,
        logics: Option<std::collections::HashMap<String, String>>,
    }

    #[derive(Deserialize)]
    struct ApplyResponse {
        release_id: Option<String>,
        reused: bool,
        dry_run: bool,
    }

    let resp: ApplyResponse = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/apply", hub_url)))?
            .json(&ApplyRequest {
                project: project.to_string(),
                env: env.to_string(),
                r#ref: git_ref.to_string(),
                only: only_list,
                dry_run,
                force,
                schema: schema_files,
                permissions,
                storage,
                logics,
            }),
    )
    .await?;

    if resp.dry_run {
        println!("[DRY RUN] Apply validated successfully.");
    } else if let Some(release_id) = resp.release_id {
        if resp.reused {
            println!("Apply complete. Reused release: {}", release_id);
        } else {
            println!("Apply complete. Release created: {}", release_id);
        }
    } else {
        println!("Apply complete.");
    }
    Ok(())
}

fn read_schema_files() -> anyhow::Result<Vec<String>> {
    let mut contents = Vec::new();
    let dir = std::path::Path::new("schema");
    if !dir.exists() {
        return Ok(contents);
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str());
        if ext == Some("yaml") || ext == Some("yml") {
            let content = std::fs::read_to_string(&path)?;
            contents.push(content);
        }
    }

    Ok(contents)
}

fn read_permissions_file() -> anyhow::Result<Option<String>> {
    let path = std::path::Path::new("config/permissions.yaml");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(std::fs::read_to_string(path)?))
}

fn read_storage_file() -> anyhow::Result<Option<String>> {
    let path = std::path::Path::new("config/storage.yaml");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(std::fs::read_to_string(path)?))
}

fn read_logics_files() -> anyhow::Result<Option<std::collections::HashMap<String, String>>> {
    let dir = std::path::Path::new("logics");
    if !dir.exists() {
        return Ok(None);
    }

    let mut map = std::collections::HashMap::new();
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("sql") {
            continue;
        }
        let content = std::fs::read_to_string(path)?;
        let rel = path.strip_prefix(dir).unwrap_or(path);
        let name = rel.with_extension("").to_string_lossy().replace('\\', "/");
        map.insert(name, content);
    }

    if map.is_empty() {
        Ok(None)
    } else {
        Ok(Some(map))
    }
}
