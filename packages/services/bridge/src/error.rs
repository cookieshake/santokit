//! Bridge 에러 타입

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Bridge 에러
#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("bad request: {message}")]
    BadRequest { message: String },

    #[error("unauthorized: {message}")]
    Unauthorized { message: String },

    #[error("forbidden: {message}")]
    Forbidden { message: String },

    #[error("not found: {message}")]
    NotFound { message: String },

    #[error("too many requests: {message}")]
    TooManyRequests { message: String },

    #[error("internal error: {message}")]
    Internal { message: String },

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("core error: {0}")]
    Core(#[from] stk_core::Error),
}

/// 에러 응답 JSON
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

impl IntoResponse for BridgeError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            BridgeError::BadRequest { message } => {
                (StatusCode::BAD_REQUEST, "BAD_REQUEST", message.clone())
            }
            BridgeError::Unauthorized { message } => {
                (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message.clone())
            }
            BridgeError::Forbidden { message } => {
                (StatusCode::FORBIDDEN, "FORBIDDEN", message.clone())
            }
            BridgeError::NotFound { message } => {
                (StatusCode::NOT_FOUND, "NOT_FOUND", message.clone())
            }
            BridgeError::TooManyRequests { message } => {
                (StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS", message.clone())
            }
            BridgeError::Internal { message } => {
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", message.clone())
            }
            BridgeError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "Database operation failed".to_string(),
                )
            }
            BridgeError::Core(e) => {
                let status = StatusCode::from_u16(e.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
                (status, e.code(), e.to_string())
            }
        };

        let body = ErrorResponse {
            error: ErrorBody {
                code: code.to_string(),
                message,
                request_id: crate::middleware::current_request_id(),
            },
        };

        (status, Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, BridgeError>;
