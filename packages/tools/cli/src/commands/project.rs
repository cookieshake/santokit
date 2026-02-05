//! 프로젝트 명령어

use crate::config::CliConfig;

pub async fn create(config: &CliConfig, name: &str) -> anyhow::Result<()> {
    println!("Creating project: {}", name);
    println!("  Hub: {:?}", config.hub_url());
    // TODO: Hub API 호출
    println!("Project create - not yet implemented");
    Ok(())
}

pub async fn list(config: &CliConfig) -> anyhow::Result<()> {
    println!("Listing projects...");
    // TODO: Hub API 호출
    println!("Project list - not yet implemented");
    Ok(())
}
