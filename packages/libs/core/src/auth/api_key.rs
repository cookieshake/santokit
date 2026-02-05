//! Project API Key
//!
//! 서버/CI 호출용 API Key 관련 타입입니다.

use serde::{Deserialize, Serialize};

/// API Key ID
///
/// API Key의 식별자로, 로깅/조회에 사용됩니다.
/// 실제 시크릿 값은 별도로 관리됩니다.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ApiKeyId(pub String);

impl ApiKeyId {
    /// 새 ID 생성
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// 내부 값 참조
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ApiKeyId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// API Key 메타데이터
///
/// Hub에 저장되는 API Key 정보입니다.
/// 실제 시크릿은 해시로 저장됩니다.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    /// Key ID
    pub id: ApiKeyId,

    /// 이름 (사람이 읽기 쉬운 식별자)
    pub name: String,

    /// 바인딩된 프로젝트 ID
    pub project_id: String,

    /// 바인딩된 환경 ID
    pub env_id: String,

    /// 프로젝트 이름 (옵션)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,

    /// 환경 이름 (옵션)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_name: Option<String>,

    /// 부여된 role 목록
    pub roles: Vec<String>,

    /// 상태
    pub status: ApiKeyStatus,

    /// 생성 시각
    pub created_at: chrono::DateTime<chrono::Utc>,

    /// 마지막 사용 시각
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// API Key 상태
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyStatus {
    /// 활성
    Active,

    /// 폐기됨
    Revoked,
}

impl ApiKeyStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiKeyStatus::Active => "active",
            ApiKeyStatus::Revoked => "revoked",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "active" => Some(ApiKeyStatus::Active),
            "revoked" => Some(ApiKeyStatus::Revoked),
            _ => None,
        }
    }
}

impl ApiKey {
    /// 활성 상태인지 확인
    pub fn is_active(&self) -> bool {
        matches!(self.status, ApiKeyStatus::Active)
    }

    /// 특정 프로젝트+환경에 바인딩되어 있는지 확인
    pub fn matches_context(&self, project_id: &str, env_id: &str) -> bool {
        self.project_id == project_id && self.env_id == env_id
    }

    /// 특정 role을 가지고 있는지 확인
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|r| r == role)
    }
}

/// API Key 전체 (ID + Secret)
///
/// 생성 시에만 사용되며, 이후 시크릿은 조회 불가합니다.
#[derive(Debug, Clone)]
pub struct ApiKeyFull {
    /// Key ID
    pub key_id: ApiKeyId,

    /// Secret (평문, 생성 시 1회만 노출)
    pub secret: String,
}

impl ApiKeyFull {
    /// `{key_id}:{secret}` 형식의 문자열로 변환
    pub fn to_header_value(&self) -> String {
        format!("{}:{}", self.key_id.0, self.secret)
    }

    /// `{key_id}:{secret}` 형식에서 파싱
    pub fn from_header_value(value: &str) -> Option<(ApiKeyId, String)> {
        let parts: Vec<&str> = value.splitn(2, ':').collect();
        if parts.len() != 2 {
            return None;
        }

        Some((ApiKeyId::new(parts[0]), parts[1].to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_context_match() {
        let key = ApiKey {
            id: ApiKeyId::new("key_123"),
            name: "Production Key".to_string(),
            project_id: "proj_abc".to_string(),
            env_id: "prod".to_string(),
            project_name: None,
            env_name: None,
            roles: vec!["admin".to_string()],
            status: ApiKeyStatus::Active,
            created_at: chrono::Utc::now(),
            last_used_at: None,
        };

        assert!(key.matches_context("proj_abc", "prod"));
        assert!(!key.matches_context("proj_abc", "dev"));
        assert!(!key.matches_context("proj_xyz", "prod"));
    }

    #[test]
    fn test_api_key_full_parsing() {
        let full = ApiKeyFull {
            key_id: ApiKeyId::new("key_123"),
            secret: "supersecret".to_string(),
        };

        let header = full.to_header_value();
        assert_eq!(header, "key_123:supersecret");

        let (parsed_id, parsed_secret) = ApiKeyFull::from_header_value(&header).unwrap();
        assert_eq!(parsed_id.as_str(), "key_123");
        assert_eq!(parsed_secret, "supersecret");
    }
}
