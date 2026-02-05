//! ID 생성 전략
//!
//! 스키마에서 정의된 `generate` 옵션에 따라 PK 값을 생성합니다.
//!
//! # 지원되는 전략
//!
//! - `ulid`: ULID (기본값, 시간순 정렬 가능)
//! - `uuid_v4`: UUID v4 (랜덤)
//! - `uuid_v7`: UUID v7 (시간순 정렬 가능)
//! - `nanoid`: NanoID (짧은 ID)
//! - `auto_increment`: DB가 생성 (Bridge는 생성하지 않음)
//! - `client`: 클라이언트가 제공 (Bridge는 생성하지 않음)

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// ID 생성 전략
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdStrategy {
    /// ULID (기본값) - 시간순 정렬 가능한 26자 문자열
    #[default]
    Ulid,

    /// UUID v4 - 완전 랜덤
    UuidV4,

    /// UUID v7 - 시간 기반, 정렬 가능
    UuidV7,

    /// NanoID - 짧은 랜덤 ID (21자 기본)
    Nanoid,

    /// DB Auto Increment - Bridge는 생성하지 않음, DB가 생성
    AutoIncrement,

    /// Client Provided - 클라이언트가 반드시 제공해야 함
    Client,
}

impl IdStrategy {
    /// Bridge가 ID를 생성해야 하는지 여부
    pub fn bridge_generates(&self) -> bool {
        matches!(
            self,
            IdStrategy::Ulid | IdStrategy::UuidV4 | IdStrategy::UuidV7 | IdStrategy::Nanoid
        )
    }

    /// 클라이언트가 ID를 제공해야 하는지 여부
    pub fn client_provides(&self) -> bool {
        matches!(self, IdStrategy::Client)
    }

    /// DB가 ID를 생성하는지 여부
    pub fn db_generates(&self) -> bool {
        matches!(self, IdStrategy::AutoIncrement)
    }

    /// 이 전략의 기본 타입 (string 또는 bigint)
    pub fn default_type(&self) -> &'static str {
        match self {
            IdStrategy::AutoIncrement => "bigint",
            _ => "string",
        }
    }
}

/// ID 생성기
pub struct IdGenerator;

impl IdGenerator {
    /// 전략에 따라 ID 생성
    pub fn generate(strategy: IdStrategy) -> Result<String> {
        match strategy {
            IdStrategy::Ulid => Ok(ulid::Ulid::new().to_string()),

            IdStrategy::UuidV4 => Ok(uuid::Uuid::new_v4().to_string()),

            IdStrategy::UuidV7 => Ok(uuid::Uuid::now_v7().to_string()),

            IdStrategy::Nanoid => Ok(nanoid()),

            IdStrategy::AutoIncrement | IdStrategy::Client => Err(Error::UnsupportedIdStrategy {
                strategy: format!("{:?}", strategy),
            }),
        }
    }
}

/// NanoID 생성 (21자, URL-safe 알파벳)
fn nanoid() -> String {
    use rand::Rng;

    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
    const SIZE: usize = 21;

    let mut rng = rand::thread_rng();
    (0..SIZE)
        .map(|_| {
            let idx = rng.gen_range(0..ALPHABET.len());
            ALPHABET[idx] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ulid_generation() {
        let id1 = IdGenerator::generate(IdStrategy::Ulid).unwrap();
        let id2 = IdGenerator::generate(IdStrategy::Ulid).unwrap();

        assert_eq!(id1.len(), 26);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_uuid_v4_generation() {
        let id = IdGenerator::generate(IdStrategy::UuidV4).unwrap();
        assert_eq!(id.len(), 36); // UUID with hyphens
    }

    #[test]
    fn test_uuid_v7_generation() {
        let id = IdGenerator::generate(IdStrategy::UuidV7).unwrap();
        assert_eq!(id.len(), 36);
    }

    #[test]
    fn test_nanoid_generation() {
        let id = IdGenerator::generate(IdStrategy::Nanoid).unwrap();
        assert_eq!(id.len(), 21);
    }

    #[test]
    fn test_auto_increment_not_generated() {
        let result = IdGenerator::generate(IdStrategy::AutoIncrement);
        assert!(result.is_err());
    }

    #[test]
    fn test_client_not_generated() {
        let result = IdGenerator::generate(IdStrategy::Client);
        assert!(result.is_err());
    }
}
