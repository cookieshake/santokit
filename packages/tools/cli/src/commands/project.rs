//! 프로젝트 명령어

use crate::config::CliConfig;
use crate::commands::http;
use serde::{Deserialize, Serialize};

pub async fn create(config: &CliConfig, name: &str) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Serialize)]
    struct CreateRequest<'a> {
        name: &'a str,
    }
    #[derive(Deserialize)]
    struct Project {
        name: String,
    }

    let project: Project = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/projects", hub_url)))?
            .json(&CreateRequest { name }),
    )
    .await?;

    println!("Created project: {}", project.name);
    Ok(())
}

pub async fn list(config: &CliConfig) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Project {
        name: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let projects: Vec<Project> = http::send_json(
        http::with_auth(config, client.get(format!("{}/api/projects", hub_url)))?,
    )
    .await?;

    if projects.is_empty() {
        println!("No projects.");
        return Ok(());
    }

    for project in projects {
        println!("{} (created {})", project.name, project.created_at);
    }
    Ok(())
}

pub async fn add_operator(
    config: &CliConfig,
    ctx: &crate::context::EffectiveContext,
    email: &str,
    role: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let hub_url = crate::commands::http::resolve_hub_url(config, ctx)?;
    let client = crate::commands::http::client();

    #[derive(Serialize)]
    struct Req<'a> {
        email: &'a str,
        role: &'a str,
    }

    crate::commands::http::send_json::<serde_json::Value>(
        crate::commands::http::with_auth(
            config,
            client
                .post(format!("{}/api/projects/{}/operators", hub_url, project))
                .json(&Req { email, role }),
        )?,
    )
    .await?;

    println!("Added operator {} to project {} as {}", email, project, role);
    Ok(())
}
