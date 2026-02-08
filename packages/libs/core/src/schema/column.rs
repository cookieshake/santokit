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

