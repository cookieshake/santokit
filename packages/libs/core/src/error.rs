//! 공통 에러 타입
//!
//! Santokit 전체에서 사용되는 에러 타입을 정의합니다.

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

/// Santokit 공통 에러
#[derive(Debug, Error)]
pub enum Error {
    // ─────────────────────────────────────────────────────────────────────────────
    // Schema Errors
    // ─────────────────────────────────────────────────────────────────────────────
    #[error("schema parse error: {message}")]
    SchemaParse { message: String },

    #[error("schema validation error: {message}")]
    SchemaValidation { message: String },

    #[error("duplicate table name: {name}")]
    DuplicateTable { name: String },

    #[error("invalid column type: {type_name}")]
    InvalidColumnType { type_name: String },

    #[error("invalid reference: table '{table}' column '{column}' references non-existent table '{ref_table}'")]
    InvalidReference {
        table: String,
        column: String,
        ref_table: String,
    },

    #[error("cross-connection reference not allowed: table '{table}' references '{ref_table}' in different connection")]
    CrossConnectionReference { table: String, ref_table: String },

    // ─────────────────────────────────────────────────────────────────────────────
    // Permission Errors
    // ─────────────────────────────────────────────────────────────────────────────
    #[error("permission parse error: {message}")]
    PermissionParse { message: String },

    #[error("CEL expression error: {message}")]
    CelExpression { message: String },

    #[error("access denied: {reason}")]
    AccessDenied { reason: String },

    // ─────────────────────────────────────────────────────────────────────────────
    // Auth Errors
    // ─────────────────────────────────────────────────────────────────────────────
    #[error("token expired")]
    TokenExpired,

    #[error("invalid token: {reason}")]
    InvalidToken { reason: String },

    #[error("project/env mismatch: expected {expected}, got {actual}")]
    ContextMismatch { expected: String, actual: String },

    // ─────────────────────────────────────────────────────────────────────────────
    // ID Generation Errors
    // ─────────────────────────────────────────────────────────────────────────────
    #[error("unsupported id generation strategy: {strategy}")]
    UnsupportedIdStrategy { strategy: String },

    // ─────────────────────────────────────────────────────────────────────────────
    // IO/Serialization Errors
    // ─────────────────────────────────────────────────────────────────────────────
    #[error("YAML parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Error {
    /// HTTP 상태 코드로 변환
    pub fn status_code(&self) -> u16 {
        match self {
            // 400 Bad Request
            Error::SchemaParse { .. }
            | Error::SchemaValidation { .. }
            | Error::PermissionParse { .. }
            | Error::CelExpression { .. }
            | Error::InvalidColumnType { .. }
            | Error::Yaml(_)
            | Error::Json(_) => 400,

            // 401 Unauthorized
            Error::TokenExpired | Error::InvalidToken { .. } => 401,

            // 403 Forbidden
            Error::AccessDenied { .. } | Error::ContextMismatch { .. } => 403,

            // 500 Internal Server Error
            _ => 500,
        }
    }

    /// 에러 코드 (클라이언트용)
    pub fn code(&self) -> &'static str {
        match self {
            Error::SchemaParse { .. } => "SCHEMA_PARSE_ERROR",
            Error::SchemaValidation { .. } => "SCHEMA_VALIDATION_ERROR",
            Error::DuplicateTable { .. } => "DUPLICATE_TABLE",
            Error::InvalidColumnType { .. } => "INVALID_COLUMN_TYPE",
            Error::InvalidReference { .. } => "INVALID_REFERENCE",
            Error::CrossConnectionReference { .. } => "CROSS_CONNECTION_REFERENCE",
            Error::PermissionParse { .. } => "PERMISSION_PARSE_ERROR",
            Error::CelExpression { .. } => "CEL_EXPRESSION_ERROR",
            Error::AccessDenied { .. } => "ACCESS_DENIED",
            Error::TokenExpired => "TOKEN_EXPIRED",
            Error::InvalidToken { .. } => "INVALID_TOKEN",
            Error::ContextMismatch { .. } => "CONTEXT_MISMATCH",
            Error::UnsupportedIdStrategy { .. } => "UNSUPPORTED_ID_STRATEGY",
            Error::Yaml(_) => "YAML_ERROR",
            Error::Json(_) => "JSON_ERROR",
        }
    }
}
