//! Audit log 조회

use crate::commands::http;
use crate::config::CliConfig;
use crate::context::EffectiveContext;
use serde::Deserialize;

pub async fn logs(
    config: &CliConfig,
    ctx: &EffectiveContext,
    project: Option<String>,
    env: Option<String>,
    operator_id: Option<String>,
    action: Option<String>,
    resource_type: Option<String>,
    limit: u32,
) -> anyhow::Result<()> {
    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    let mut url = reqwest::Url::parse(&format!("{}/api/audit/logs", hub_url))?;
    {
        let mut pairs = url.query_pairs_mut();
        if let Some(project) = project.or_else(|| ctx.project.clone()) {
            pairs.append_pair("project", &project);
        }
        if let Some(env) = env.or_else(|| ctx.env.clone()) {
            pairs.append_pair("env", &env);
        }
        if let Some(operator_id) = operator_id {
            pairs.append_pair("operator_id", &operator_id);
        }
        if let Some(action) = action {
            pairs.append_pair("action", &action);
        }
        if let Some(resource_type) = resource_type {
            pairs.append_pair("resource_type", &resource_type);
        }
        pairs.append_pair("limit", &limit.to_string());
    }

    #[derive(Deserialize)]
    struct AuditLog {
        id: String,
        operator_id: String,
        action: String,
        resource_type: String,
        resource_id: Option<String>,
        project_id: Option<String>,
        env_id: Option<String>,
        metadata: Option<serde_json::Value>,
        created_at: String,
    }

    let list: Vec<AuditLog> = http::send_json(
        http::with_auth(config, client.get(url))?,
    )
    .await?;

    if list.is_empty() {
        println!("No audit logs.");
        return Ok(());
    }

    for item in list {
        println!(
            "- {} {} {} {} {}",
            item.created_at, item.id, item.operator_id, item.action, item.resource_type
        );
        if let Some(resource_id) = item.resource_id {
            println!("  resource_id: {}", resource_id);
        }
        if let Some(project_id) = item.project_id {
            println!("  project_id: {}", project_id);
        }
        if let Some(env_id) = item.env_id {
            println!("  env_id: {}", env_id);
        }
        if let Some(metadata) = item.metadata {
            println!("  metadata: {}", metadata);
        }
    }

    Ok(())
}
