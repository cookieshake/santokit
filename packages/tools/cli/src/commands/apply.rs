//! Apply 명령어
//!
//! 스키마, 권한, 릴리즈를 한 번에 적용합니다.

use crate::config::CliConfig;
use crate::context::EffectiveContext;

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

    println!("Applying to {}/{}", project, env);
    println!("  Ref: {}", git_ref);
    println!("  Only: {:?}", only);
    println!("  Dry run: {}", dry_run);
    println!("  Force: {}", force);

    // TODO: 실제 구현
    // 1. schema/*.yaml 읽기
    // 2. config/permissions.yaml 읽기
    // 3. Hub API 호출 (POST /api/apply)
    //    - schema validate/plan
    //    - (dry_run이 아니면) schema apply
    //    - drift check
    //    - permissions apply
    //    - release create
    // 4. 결과 출력 (releaseId 포함)

    if dry_run {
        println!("\n[DRY RUN] Would apply the following:");
    }

    println!("\nApply - not yet implemented");
    Ok(())
}
