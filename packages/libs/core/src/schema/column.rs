//! 컬럼 정의
//!
//! 테이블의 컬럼 메타데이터를 정의합니다.

use serde::{Deserialize, Serialize};

use super::types::ColumnType;

/// 컬럼 정의
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    /// 컬럼 이름
    pub name: String,

    /// 컬럼 타입
    #[serde(flatten)]
    pub column_type: ColumnType,

    /// NULL 허용 여부
    #[serde(default)]
    pub nullable: bool,

    /// 유니크 제약
    #[serde(default)]
    pub unique: bool,

    /// 기본값 (SQL 표현식)
    #[serde(default)]
    pub default: Option<String>,

    /// 외래키 참조
    #[serde(default)]
    pub references: Option<Reference>,
}

/// 컬럼 이름 prefix 규칙
///
/// 컬럼명 prefix로 민감도/기본 노출을 자동 적용합니다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnPrefix {
    /// 일반 컬럼
    Normal,

    /// `s_` - Sensitive: owner/admin 중심 접근
    Sensitive,

    /// `c_` - Critical: admin only, 기본 결과 제외
    Critical,

    /// `p_` - Private: admin only, 기본 결과 제외
    Private,

    /// `_` - System: read-only, insert/update 불가
    System,
}

impl ColumnPrefix {
    /// 컬럼 이름에서 prefix 판별
    pub fn from_column_name(name: &str) -> Self {
        if name.starts_with("s_") {
            ColumnPrefix::Sensitive
        } else if name.starts_with("c_") {
            ColumnPrefix::Critical
        } else if name.starts_with("p_") {
            ColumnPrefix::Private
        } else if name.starts_with('_') {
            ColumnPrefix::System
        } else {
            ColumnPrefix::Normal
        }
    }

    /// SELECT * 시 기본 포함 여부
    pub fn included_in_select_all(&self) -> bool {
        matches!(self, ColumnPrefix::Normal | ColumnPrefix::Sensitive)
    }

    /// Insert/Update 허용 여부
    pub fn allows_write(&self) -> bool {
        !matches!(self, ColumnPrefix::System)
    }

    /// Admin 전용 여부
    pub fn admin_only(&self) -> bool {
        matches!(self, ColumnPrefix::Critical | ColumnPrefix::Private)
    }
}

/// 외래키 참조 정의
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    /// 참조 대상 테이블
    pub table: String,

    /// 참조 대상 컬럼 (생략 시 대상 테이블의 PK)
    #[serde(default)]
    pub column: Option<String>,

    /// 관계 이름 (expand에서 사용)
    #[serde(rename = "as")]
    pub alias: Option<String>,

    /// 참조 대상 삭제 시 동작
    #[serde(default, rename = "onDelete")]
    pub on_delete: ReferentialAction,

    /// 참조 대상 갱신 시 동작
    #[serde(default, rename = "onUpdate")]
    pub on_update: ReferentialAction,
}

/// 참조 무결성 동작
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReferentialAction {
    /// 참조 위반 시 거부 (기본값)
    #[default]
    Restrict,

    /// 아무 동작 없음 (DB가 나중에 체크)
    NoAction,

    /// 함께 삭제/갱신
    Cascade,

    /// NULL로 설정
    SetNull,

    /// 기본값으로 설정
    SetDefault,
}

impl ReferentialAction {
    /// Postgres SQL 키워드로 변환
    pub fn to_postgres(&self) -> &'static str {
        match self {
            ReferentialAction::Restrict => "RESTRICT",
            ReferentialAction::NoAction => "NO ACTION",
            ReferentialAction::Cascade => "CASCADE",
            ReferentialAction::SetNull => "SET NULL",
            ReferentialAction::SetDefault => "SET DEFAULT",
        }
    }
}

impl Column {
    /// 컬럼의 prefix 규칙 반환
    pub fn prefix(&self) -> ColumnPrefix {
        ColumnPrefix::from_column_name(&self.name)
    }

    /// 이 컬럼이 SELECT * 결과에 기본 포함되는지
    pub fn included_in_select_all(&self) -> bool {
        self.prefix().included_in_select_all()
    }

    /// 이 컬럼이 Insert/Update에 허용되는지
    pub fn allows_write(&self) -> bool {
        self.prefix().allows_write()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_column_prefix_detection() {
        assert_eq!(ColumnPrefix::from_column_name("email"), ColumnPrefix::Normal);
        assert_eq!(
            ColumnPrefix::from_column_name("s_phone"),
            ColumnPrefix::Sensitive
        );
        assert_eq!(
            ColumnPrefix::from_column_name("c_ssn"),
            ColumnPrefix::Critical
        );
        assert_eq!(
            ColumnPrefix::from_column_name("p_internal"),
            ColumnPrefix::Private
        );
        assert_eq!(
            ColumnPrefix::from_column_name("_created_at"),
            ColumnPrefix::System
        );
    }

    #[test]
    fn test_select_all_inclusion() {
        assert!(ColumnPrefix::Normal.included_in_select_all());
        assert!(ColumnPrefix::Sensitive.included_in_select_all());
        assert!(!ColumnPrefix::Critical.included_in_select_all());
        assert!(!ColumnPrefix::Private.included_in_select_all());
    }

    #[test]
    fn test_write_permission() {
        assert!(ColumnPrefix::Normal.allows_write());
        assert!(ColumnPrefix::Sensitive.allows_write());
        assert!(ColumnPrefix::Critical.allows_write());
        assert!(!ColumnPrefix::System.allows_write());
    }
}
