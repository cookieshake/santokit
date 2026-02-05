//! 인증 관련 타입 및 로직
//!
//! # 개요
//!
//! Santokit의 인증은 두 가지 주체를 다룹니다:
//!
//! - **Operator**: Hub(Control Plane)를 운영하는 팀 멤버
//! - **End User**: Bridge(Data Plane)의 API를 호출하는 앱 사용자
//!
//! # 토큰 종류
//!
//! - **API Key**: 서버/CI용 (프로젝트+환경에 바인딩)
//! - **Access Token**: End User용 PASETO v4.local (암호화)
//! - **Refresh Token**: Opaque 토큰 (Hub 저장)

mod api_key;
mod claims;
mod token;

pub use api_key::{ApiKey, ApiKeyId};
pub use claims::{AccessTokenClaims, RefreshTokenClaims};
pub use token::{TokenKind, TokenValidator};
