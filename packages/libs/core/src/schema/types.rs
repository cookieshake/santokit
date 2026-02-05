//! 논리적 컬럼 타입 정의
//!
//! Santokit은 DB 엔진에 독립적인 논리적 타입을 사용합니다.
//! Hub가 이를 실제 DB 타입으로 매핑합니다.

use serde::{Deserialize, Serialize};

/// 논리적 컬럼 타입
///
/// # JSON 직렬화
///
/// - `bigint`, `decimal`은 정밀도 보장을 위해 JSON에서 문자열로 전송됩니다.
/// - `timestamp`는 ISO 8601 문자열로 전송됩니다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ColumnType {
    /// 문자열 (VARCHAR/TEXT)
    String,

    /// 32비트 정수
    Int,

    /// 64비트 정수 (JSON: string)
    Bigint,

    /// 64비트 부동소수점 (Double Precision)
    Float,

    /// 고정 소수점 (금융용, JSON: string)
    Decimal {
        #[serde(default = "default_precision")]
        precision: u8,
        #[serde(default = "default_scale")]
        scale: u8,
    },

    /// 불리언
    Boolean,

    /// JSON/JSONB
    Json,

    /// 타임스탬프 (JSON: ISO 8601 string)
    Timestamp,

    /// 바이트 배열 (BYTEA)
    Bytes,

    /// 파일 경로 (Storage 연동)
    File {
        /// 대상 버킷 alias
        bucket: String,
        /// Row 삭제 시 파일 처리 정책
        #[serde(default)]
        on_delete: FileDeletePolicy,
    },

    /// 배열 (JSON 컬럼에 저장)
    Array {
        /// 요소 타입
        items: Box<ColumnType>,
    },
}

fn default_precision() -> u8 {
    18
}
fn default_scale() -> u8 {
    2
}

/// 파일 삭제 정책
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileDeletePolicy {
    /// 파일 유지 (기본값)
    #[default]
    Preserve,

    /// 파일도 함께 삭제
    Cascade,
}

impl ColumnType {
    /// 간단한 타입 문자열에서 파싱
    ///
    /// 복잡한 타입(file, array)은 전체 YAML 구조로 파싱해야 합니다.
    pub fn from_simple_str(s: &str) -> Option<Self> {
        match s {
            "string" => Some(ColumnType::String),
            "int" => Some(ColumnType::Int),
            "bigint" => Some(ColumnType::Bigint),
            "float" => Some(ColumnType::Float),
            "decimal" => Some(ColumnType::Decimal {
                precision: default_precision(),
                scale: default_scale(),
            }),
            "boolean" | "bool" => Some(ColumnType::Boolean),
            "json" => Some(ColumnType::Json),
            "timestamp" => Some(ColumnType::Timestamp),
            "bytes" => Some(ColumnType::Bytes),
            _ => None,
        }
    }

    /// Postgres 타입 문자열로 변환
    pub fn to_postgres_type(&self) -> String {
        match self {
            ColumnType::String => "TEXT".to_string(),
            ColumnType::Int => "INTEGER".to_string(),
            ColumnType::Bigint => "BIGINT".to_string(),
            ColumnType::Float => "DOUBLE PRECISION".to_string(),
            ColumnType::Decimal { precision, scale } => {
                format!("NUMERIC({},{})", precision, scale)
            }
            ColumnType::Boolean => "BOOLEAN".to_string(),
            ColumnType::Json => "JSONB".to_string(),
            ColumnType::Timestamp => "TIMESTAMPTZ".to_string(),
            ColumnType::Bytes => "BYTEA".to_string(),
            // File은 경로 문자열로 저장
            ColumnType::File { .. } => "TEXT".to_string(),
            // Array는 JSONB로 저장 (엔진 중립)
            ColumnType::Array { .. } => "JSONB".to_string(),
        }
    }

    /// JSON 값 검증을 위한 예상 타입 반환
    pub fn expected_json_type(&self) -> &'static str {
        match self {
            ColumnType::String | ColumnType::File { .. } => "string",
            ColumnType::Int | ColumnType::Float => "number",
            ColumnType::Bigint | ColumnType::Decimal { .. } | ColumnType::Timestamp => {
                "string (serialized)"
            }
            ColumnType::Boolean => "boolean",
            ColumnType::Json => "any",
            ColumnType::Bytes => "string (base64)",
            ColumnType::Array { .. } => "array",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_type_parsing() {
        assert_eq!(ColumnType::from_simple_str("string"), Some(ColumnType::String));
        assert_eq!(ColumnType::from_simple_str("int"), Some(ColumnType::Int));
        assert_eq!(ColumnType::from_simple_str("bigint"), Some(ColumnType::Bigint));
        assert_eq!(ColumnType::from_simple_str("boolean"), Some(ColumnType::Boolean));
        assert_eq!(ColumnType::from_simple_str("bool"), Some(ColumnType::Boolean));
        assert_eq!(ColumnType::from_simple_str("unknown"), None);
    }

    #[test]
    fn test_postgres_type_mapping() {
        assert_eq!(ColumnType::String.to_postgres_type(), "TEXT");
        assert_eq!(ColumnType::Bigint.to_postgres_type(), "BIGINT");
        assert_eq!(
            ColumnType::Decimal {
                precision: 10,
                scale: 4
            }
            .to_postgres_type(),
            "NUMERIC(10,4)"
        );
    }
}
