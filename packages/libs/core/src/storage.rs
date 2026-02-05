//! Storage 설정 타입

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::permissions::RoleRequirement;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StorageConfig {
    #[serde(default)]
    pub buckets: HashMap<String, BucketConfig>,

    #[serde(default)]
    pub policies: HashMap<String, StoragePolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketConfig {
    pub provider: String,
    pub region: String,
    pub bucket: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StoragePolicy {
    #[serde(default)]
    pub upload_sign: Option<StoragePolicyRule>,
    #[serde(default)]
    pub download_sign: Option<StoragePolicyRule>,
    #[serde(default)]
    pub delete: Option<StoragePolicyRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoragePolicyRule {
    #[serde(default)]
    pub roles: Vec<RoleRequirement>,
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default)]
    pub max_size: Option<String>,
    #[serde(default)]
    pub allowed_types: Option<Vec<String>>,
}

impl StoragePolicyRule {
    pub fn max_size_bytes(&self) -> Option<u64> {
        self.max_size.as_deref().and_then(parse_size_bytes)
    }
}

pub fn parse_size_bytes(input: &str) -> Option<u64> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut num_part = String::new();
    let mut unit_part = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            num_part.push(ch);
        } else if !ch.is_whitespace() {
            unit_part.push(ch);
        }
    }

    let value: f64 = num_part.parse().ok()?;
    let unit = unit_part.to_ascii_lowercase();

    let multiplier = match unit.as_str() {
        "b" | "" => 1.0,
        "kb" | "k" => 1024.0,
        "mb" | "m" => 1024.0 * 1024.0,
        "gb" | "g" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };

    Some((value * multiplier) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_size_bytes() {
        assert_eq!(parse_size_bytes("5MB"), Some(5 * 1024 * 1024));
        assert_eq!(parse_size_bytes("1kb"), Some(1024));
        assert_eq!(parse_size_bytes("100"), Some(100));
    }
}
