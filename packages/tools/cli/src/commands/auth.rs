//! 인증 명령어

use crate::config::CliConfig;

pub async fn login(config: &CliConfig) -> anyhow::Result<()> {
    // TODO: Hub에 로그인 요청
    // 1. 이메일/비밀번호 입력 (inquire)
    // 2. Hub API 호출
    // 3. 토큰 저장

    println!("Login - not yet implemented");
    println!("Hub URL: {:?}", config.hub_url());
    Ok(())
}

pub async fn logout(config: &CliConfig) -> anyhow::Result<()> {
    // TODO: 토큰 삭제
    println!("Logout - not yet implemented");
    Ok(())
}

pub async fn whoami(config: &CliConfig) -> anyhow::Result<()> {
    // TODO: Hub에서 현재 사용자 정보 조회
    match config.get_auth_token() {
        Ok(_) => println!("Logged in (token present)"),
        Err(_) => println!("Not logged in"),
    }
    Ok(())
}
