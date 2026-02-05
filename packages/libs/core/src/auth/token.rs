//! 토큰 검증 및 유틸리티
//!
//! Bridge에서 토큰을 검증하는 로직입니다.

use crate::error::{Error, Result};

use super::api_key::{ApiKey, ApiKeyId};
use super::claims::AccessTokenClaims;

/// 토큰 종류
#[derive(Debug, Clone)]
pub enum TokenKind {
    /// API Key (서버/CI용)
    ApiKey {
        key_id: ApiKeyId,
        secret: String,
    },

    /// End User Access Token (PASETO)
    AccessToken(String),
}

impl TokenKind {
    /// HTTP 헤더에서 토큰 추출
    ///
    /// # 추출 우선순위
    /// 1. `X-Santokit-Api-Key` 헤더 → ApiKey
    /// 2. `Authorization: Bearer ...` → AccessToken
    pub fn from_headers(
        api_key_header: Option<&str>,
        auth_header: Option<&str>,
    ) -> Option<Self> {
        // 1. API Key 헤더 우선
        if let Some(value) = api_key_header {
            if let Some((key_id, secret)) = super::api_key::ApiKeyFull::from_header_value(value) {
                return Some(TokenKind::ApiKey { key_id, secret });
            }
        }

        // 2. Authorization 헤더
        if let Some(value) = auth_header {
            if let Some(token) = value.strip_prefix("Bearer ") {
                return Some(TokenKind::AccessToken(token.to_string()));
            }
        }

        None
    }
}

/// 토큰 검증기
///
/// Bridge에서 토큰을 검증하고 컨텍스트를 추출합니다.
pub struct TokenValidator {
    /// PASETO 복호화 키 (현재 + 이전 키들)
    /// TODO: 실제 PASETO 키 타입으로 변경
    _symmetric_keys: Vec<String>,
}

impl TokenValidator {
    /// 새 검증기 생성
    pub fn new(symmetric_keys: Vec<String>) -> Self {
        Self {
            _symmetric_keys: symmetric_keys,
        }
    }

    /// Access Token 검증 및 Claims 추출
    ///
    /// # TODO
    /// 실제 PASETO 검증은 후속 구현에서 진행합니다.
    pub fn validate_access_token(&self, _token: &str) -> Result<AccessTokenClaims> {
        // TODO: pasetors 크레이트로 실제 검증 구현
        // 1. 토큰 복호화
        // 2. kid로 적절한 키 선택
        // 3. exp 검증
        // 4. claims 반환

        Err(Error::InvalidToken {
            reason: "token validation not yet implemented".to_string(),
        })
    }

    /// Access Token Claims를 컨텍스트와 대조 검증
    pub fn verify_context(
        claims: &AccessTokenClaims,
        expected_project: &str,
        expected_env: &str,
    ) -> Result<()> {
        // 만료 체크
        if claims.is_expired() {
            return Err(Error::TokenExpired);
        }

        // 컨텍스트 체크
        if !claims.matches_context(expected_project, expected_env) {
            return Err(Error::ContextMismatch {
                expected: format!("{}/{}", expected_project, expected_env),
                actual: format!("{}/{}", claims.project_id, claims.env_id),
            });
        }

        Ok(())
    }

    /// API Key 검증
    ///
    /// # TODO
    /// 실제 검증은 Hub API 호출 또는 캐시 조회로 수행합니다.
    pub fn verify_api_key(
        key: &ApiKey,
        expected_project: &str,
        expected_env: &str,
    ) -> Result<()> {
        // 활성 상태 체크
        if !key.is_active() {
            return Err(Error::InvalidToken {
                reason: "API key has been revoked".to_string(),
            });
        }

        // 컨텍스트 체크
        if !key.matches_context(expected_project, expected_env) {
            return Err(Error::ContextMismatch {
                expected: format!("{}/{}", expected_project, expected_env),
                actual: format!("{}/{}", key.project_id, key.env_id),
            });
        }

        Ok(())
    }
}

/// 인증된 주체
///
/// 토큰 검증 후 확정된 호출자 정보입니다.
#[derive(Debug, Clone)]
pub enum AuthenticatedPrincipal {
    /// API Key로 인증된 서버/CI
    ApiKey {
        key_id: ApiKeyId,
        project_id: String,
        env_id: String,
        roles: Vec<String>,
    },

    /// Access Token으로 인증된 End User
    EndUser {
        user_id: String,
        project_id: String,
        env_id: String,
        roles: Vec<String>,
    },
}

impl AuthenticatedPrincipal {
    /// Subject ID (key_id 또는 user_id)
    pub fn subject(&self) -> &str {
        match self {
            AuthenticatedPrincipal::ApiKey { key_id, .. } => key_id.as_str(),
            AuthenticatedPrincipal::EndUser { user_id, .. } => user_id,
        }
    }

    /// 프로젝트 ID
    pub fn project_id(&self) -> &str {
        match self {
            AuthenticatedPrincipal::ApiKey { project_id, .. } => project_id,
            AuthenticatedPrincipal::EndUser { project_id, .. } => project_id,
        }
    }

    /// 환경 ID
    pub fn env_id(&self) -> &str {
        match self {
            AuthenticatedPrincipal::ApiKey { env_id, .. } => env_id,
            AuthenticatedPrincipal::EndUser { env_id, .. } => env_id,
        }
    }

    /// Role 목록
    pub fn roles(&self) -> &[String] {
        match self {
            AuthenticatedPrincipal::ApiKey { roles, .. } => roles,
            AuthenticatedPrincipal::EndUser { roles, .. } => roles,
        }
    }

    /// 특정 role 보유 확인
    pub fn has_role(&self, role: &str) -> bool {
        self.roles().iter().any(|r| r == role)
    }

    /// API Key인지 확인
    pub fn is_api_key(&self) -> bool {
        matches!(self, AuthenticatedPrincipal::ApiKey { .. })
    }

    /// End User인지 확인
    pub fn is_end_user(&self) -> bool {
        matches!(self, AuthenticatedPrincipal::EndUser { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_kind_from_headers() {
        // API Key 우선
        let kind = TokenKind::from_headers(
            Some("key_123:secret"),
            Some("Bearer token"),
        );
        assert!(matches!(kind, Some(TokenKind::ApiKey { .. })));

        // Bearer only
        let kind = TokenKind::from_headers(None, Some("Bearer mytoken"));
        match kind {
            Some(TokenKind::AccessToken(token)) => assert_eq!(token, "mytoken"),
            _ => panic!("Expected AccessToken"),
        }

        // Neither
        let kind = TokenKind::from_headers(None, None);
        assert!(kind.is_none());
    }

    #[test]
    fn test_authenticated_principal() {
        let principal = AuthenticatedPrincipal::EndUser {
            user_id: "user_123".to_string(),
            project_id: "proj_abc".to_string(),
            env_id: "prod".to_string(),
            roles: vec!["admin".to_string(), "writer".to_string()],
        };

        assert_eq!(principal.subject(), "user_123");
        assert_eq!(principal.project_id(), "proj_abc");
        assert!(principal.has_role("admin"));
        assert!(!principal.has_role("reader"));
        assert!(principal.is_end_user());
        assert!(!principal.is_api_key());
    }
}
