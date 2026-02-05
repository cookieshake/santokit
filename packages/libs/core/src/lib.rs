//! stk-core: Santokit 공통 핵심 라이브러리
//!
//! 이 크레이트는 Hub, Bridge, CLI가 공유하는 핵심 타입과 로직을 제공합니다.
//!
//! # 모듈 구조
//!
//! - `schema`: 선언 스키마(YAML) 파싱 및 IR 생성
//! - `permissions`: 권한 정책 파싱 및 CEL 평가
//! - `auth`: 인증 토큰 구조 및 검증 로직
//! - `error`: 공통 에러 타입
//! - `id`: ID 생성 전략 (ULID, UUID 등)

pub mod auth;
pub mod error;
pub mod id;
pub mod permissions;
pub mod schema;
pub mod storage;

pub use error::{Error, Result};
