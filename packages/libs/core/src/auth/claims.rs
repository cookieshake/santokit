//! 토큰 Claims
//!
//! Access Token과 Refresh Token의 페이로드 구조입니다.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Access Token Claims (PASETO v4.local 페이로드)
///
/// Bridge가 검증하고 복호화하는 End User 토큰의 내용입니다.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    /// Subject (내부 End User ID, 정규화된 ID)
    pub sub: String,

    /// 프로젝트 ID
    pub project_id: String,

    /// 환경 ID
    pub env_id: String,

    /// Role 목록
    pub roles: Vec<String>,

    /// 발급 시각
    pub iat: DateTime<Utc>,

    /// 만료 시각
    pub exp: DateTime<Utc>,

    /// JWT ID (revocation/audit용)
    pub jti: String,

    /// Key ID (키 로테이션용)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kid: Option<String>,
}

impl AccessTokenClaims {
    /// 새 claims 생성
    pub fn new(
        sub: String,
        project_id: String,
        env_id: String,
        roles: Vec<String>,
        ttl_seconds: i64,
    ) -> Self {
        let now = Utc::now();
        Self {
            sub,
            project_id,
            env_id,
            roles,
            iat: now,
            exp: now + chrono::Duration::seconds(ttl_seconds),
            jti: ulid::Ulid::new().to_string(),
            kid: None,
        }
    }

    /// Key ID 설정
    pub fn with_kid(mut self, kid: String) -> Self {
        self.kid = Some(kid);
        self
    }

    /// 만료 여부 확인
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.exp
    }

    /// 프로젝트+환경 컨텍스트 일치 확인
    pub fn matches_context(&self, project_id: &str, env_id: &str) -> bool {
        self.project_id == project_id && self.env_id == env_id
    }

    /// 특정 role 보유 확인
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }

    /// 남은 TTL (초)
    pub fn remaining_ttl(&self) -> i64 {
        let diff = self.exp - Utc::now();
        diff.num_seconds().max(0)
    }
}

/// Refresh Token Claims
///
/// Hub에서 관리하는 Refresh Token 메타데이터입니다.
/// 실제 토큰은 opaque(랜덤)이며, Hub는 해시로 저장합니다.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenClaims {
    /// Token ID
    pub id: String,

    /// 연결된 End User ID
    pub end_user_id: String,

    /// 프로젝트 ID
    pub project_id: String,

    /// 환경 ID
    pub env_id: String,

    /// 만료 시각
    pub expires_at: DateTime<Utc>,

    /// 폐기 시각 (로그아웃 시 설정)
    pub revoked_at: Option<DateTime<Utc>>,

    /// 생성 시각
    pub created_at: DateTime<Utc>,
}

impl RefreshTokenClaims {
    /// 새 claims 생성
    pub fn new(
        end_user_id: String,
        project_id: String,
        env_id: String,
        ttl_seconds: i64,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: ulid::Ulid::new().to_string(),
            end_user_id,
            project_id,
            env_id,
            expires_at: now + chrono::Duration::seconds(ttl_seconds),
            revoked_at: None,
            created_at: now,
        }
    }

    /// 유효성 확인 (만료/폐기)
    pub fn is_valid(&self) -> bool {
        let now = Utc::now();
        self.revoked_at.is_none() && self.expires_at > now
    }

    /// 폐기 처리
    pub fn revoke(&mut self) {
        self.revoked_at = Some(Utc::now());
    }
}

/// 쿠키 이름 생성 헬퍼
pub struct CookieNames;

impl CookieNames {
    /// Access Token 쿠키 이름
    pub fn access(project: &str, env: &str) -> String {
        format!("stk_access_{}_{}", project, env)
    }

    /// Refresh Token 쿠키 이름
    pub fn refresh(project: &str, env: &str) -> String {
        format!("stk_refresh_{}_{}", project, env)
    }

    /// 쿠키 이름에서 project/env 추출
    pub fn parse_access(cookie_name: &str) -> Option<(String, String)> {
        Self::parse_cookie_name(cookie_name, "stk_access_")
    }

    /// 쿠키 이름에서 project/env 추출
    pub fn parse_refresh(cookie_name: &str) -> Option<(String, String)> {
        Self::parse_cookie_name(cookie_name, "stk_refresh_")
    }

    fn parse_cookie_name(name: &str, prefix: &str) -> Option<(String, String)> {
        let rest = name.strip_prefix(prefix)?;
        let parts: Vec<&str> = rest.splitn(2, '_').collect();
        if parts.len() != 2 {
            return None;
        }
        Some((parts[0].to_string(), parts[1].to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_access_token_claims() {
        let claims = AccessTokenClaims::new(
            "user_123".to_string(),
            "proj_abc".to_string(),
            "prod".to_string(),
            vec!["admin".to_string()],
            3600,
        );

        assert!(!claims.is_expired());
        assert!(claims.matches_context("proj_abc", "prod"));
        assert!(!claims.matches_context("proj_abc", "dev"));
        assert!(claims.has_role("admin"));
        assert!(!claims.has_role("reader"));
    }

    #[test]
    fn test_refresh_token_validity() {
        let mut claims = RefreshTokenClaims::new(
            "user_123".to_string(),
            "proj_abc".to_string(),
            "prod".to_string(),
            86400,
        );

        assert!(claims.is_valid());

        claims.revoke();
        assert!(!claims.is_valid());
    }

    #[test]
    fn test_cookie_names() {
        assert_eq!(CookieNames::access("myapp", "prod"), "stk_access_myapp_prod");
        assert_eq!(CookieNames::refresh("myapp", "prod"), "stk_refresh_myapp_prod");

        let (proj, env) = CookieNames::parse_access("stk_access_myapp_prod").unwrap();
        assert_eq!(proj, "myapp");
        assert_eq!(env, "prod");
    }
}
