//! 스키마 YAML 파서
//!
//! `schema/*.yaml` 파일을 파싱하여 Schema IR로 변환합니다.

use std::collections::HashMap;

use serde::Deserialize;

use super::column::{Column, Reference, ReferentialAction};
use super::ir::{ProjectSchema, SchemaIr};
use super::table::{IdColumn, Index, Table};
use super::types::ColumnType;
use crate::error::{Error, Result};
use crate::id::IdStrategy;

/// 스키마 파서
pub struct SchemaParser;

impl SchemaParser {
    /// 단일 YAML 문자열 파싱
    pub fn parse_yaml(yaml: &str) -> Result<Vec<Table>> {
        let raw: RawSchema = serde_yaml::from_str(yaml)?;
        Self::convert_raw_schema(raw)
    }

    /// 여러 YAML 파일을 파싱하여 ProjectSchema 생성
    pub fn parse_multiple(yamls: &[&str]) -> Result<ProjectSchema> {
        let mut all_tables = Vec::new();

        for yaml in yamls {
            let tables = Self::parse_yaml(yaml)?;
            all_tables.extend(tables);
        }

        Self::build_project_schema(all_tables)
    }

    /// 테이블 목록을 ProjectSchema로 변환 (connection별 그룹핑)
    pub fn build_project_schema(tables: Vec<Table>) -> Result<ProjectSchema> {
        let mut schema = ProjectSchema::new();
        let mut table_names = std::collections::HashSet::new();

        for table in tables {
            // 테이블 이름 중복 검사 (전역)
            if !table_names.insert(table.name.clone()) {
                return Err(Error::DuplicateTable {
                    name: table.name.clone(),
                });
            }

            // Connection별 IR에 추가
            let ir = schema
                .connections
                .entry(table.connection.clone())
                .or_insert_with(|| SchemaIr::new(table.connection.clone()));

            ir.add_table(table);
        }

        // 참조 검증
        let ref_errors = schema.validate_all_references();
        if let Some((_conn, error)) = ref_errors.first() {
            match error {
                super::ir::ReferenceError::TableNotFound {
                    from_table,
                    from_column,
                    ref_table,
                } => {
                    return Err(Error::InvalidReference {
                        table: from_table.clone(),
                        column: from_column.clone(),
                        ref_table: ref_table.clone(),
                    });
                }
            }
        }

        Ok(schema)
    }

    /// Raw 스키마를 Table 목록으로 변환
    fn convert_raw_schema(raw: RawSchema) -> Result<Vec<Table>> {
        let mut tables = Vec::new();

        for (name, raw_table) in raw.tables {
            let table = Self::convert_raw_table(name, raw_table)?;
            tables.push(table);
        }

        Ok(tables)
    }

    /// Raw 테이블을 Table로 변환
    fn convert_raw_table(name: String, raw: RawTable) -> Result<Table> {
        let id = Self::convert_raw_id(raw.id)?;
        let columns = Self::convert_raw_columns(raw.columns)?;
        let indexes = Self::convert_raw_indexes(raw.indexes);

        Ok(Table {
            name,
            connection: raw.connection.unwrap_or_else(|| "main".to_string()),
            id,
            columns,
            indexes,
        })
    }

    /// Raw ID 컬럼 변환
    fn convert_raw_id(raw: Option<RawIdColumn>) -> Result<IdColumn> {
        match raw {
            None => Ok(IdColumn::default()),
            Some(raw_id) => Ok(IdColumn {
                name: raw_id.name.unwrap_or_else(|| "id".to_string()),
                generate: raw_id.generate.unwrap_or_default(),
            }),
        }
    }

    /// Raw 컬럼들 변환
    fn convert_raw_columns(raw: Option<HashMap<String, RawColumn>>) -> Result<Vec<Column>> {
        let Some(raw_columns) = raw else {
            return Ok(Vec::new());
        };

        let mut columns = Vec::new();

        for (name, raw_col) in raw_columns {
            let column = Self::convert_raw_column(name, raw_col)?;
            columns.push(column);
        }

        // 이름순 정렬 (일관성)
        columns.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(columns)
    }

    /// Raw 컬럼 변환
    fn convert_raw_column(name: String, raw: RawColumn) -> Result<Column> {
        let column_type = Self::parse_column_type(&raw)?;
        let references = raw.references.map(|r| Reference {
            table: r.table,
            column: r.column,
            alias: r.alias,
            on_delete: r.on_delete.unwrap_or_default(),
            on_update: r.on_update.unwrap_or_default(),
        });

        Ok(Column {
            name,
            column_type,
            nullable: raw.nullable.unwrap_or(true),
            unique: raw.unique.unwrap_or(false),
            default: raw.default,
            references,
        })
    }

    /// 컬럼 타입 파싱
    fn parse_column_type(raw: &RawColumn) -> Result<ColumnType> {
        let type_str = raw.column_type.as_deref().unwrap_or("string");

        // Simple types
        if let Some(simple) = ColumnType::from_simple_str(type_str) {
            return Ok(simple);
        }

        // Array type
        if type_str == "array" {
            let items_type = raw
                .items
                .as_deref()
                .and_then(ColumnType::from_simple_str)
                .unwrap_or(ColumnType::String);

            return Ok(ColumnType::Array {
                items: Box::new(items_type),
            });
        }

        // File type
        if type_str == "file" {
            let bucket = raw
                .bucket
                .clone()
                .ok_or_else(|| Error::SchemaValidation {
                    message: "file type requires 'bucket' field".to_string(),
                })?;

            return Ok(ColumnType::File {
                bucket,
                on_delete: raw.on_delete.unwrap_or_default(),
            });
        }

        Err(Error::InvalidColumnType {
            type_name: type_str.to_string(),
        })
    }

    /// Raw 인덱스들 변환
    fn convert_raw_indexes(raw: Option<Vec<RawIndex>>) -> Vec<Index> {
        raw.unwrap_or_default()
            .into_iter()
            .map(|r| Index {
                name: r.name,
                columns: r.columns,
                unique: r.unique.unwrap_or(false),
            })
            .collect()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw YAML 구조체 (serde 역직렬화용)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RawSchema {
    #[serde(default = "default_version")]
    #[allow(dead_code)]
    version: u32,
    tables: HashMap<String, RawTable>,
}

fn default_version() -> u32 {
    1
}

#[derive(Debug, Deserialize)]
struct RawTable {
    connection: Option<String>,
    id: Option<RawIdColumn>,
    columns: Option<HashMap<String, RawColumn>>,
    indexes: Option<Vec<RawIndex>>,
}

#[derive(Debug, Deserialize)]
struct RawIdColumn {
    name: Option<String>,
    generate: Option<IdStrategy>,
}

#[derive(Debug, Deserialize)]
struct RawColumn {
    #[serde(rename = "type")]
    column_type: Option<String>,
    nullable: Option<bool>,
    unique: Option<bool>,
    default: Option<String>,
    references: Option<RawReference>,
    // Array specific
    items: Option<String>,
    // File specific
    bucket: Option<String>,
    #[serde(rename = "onDelete")]
    on_delete: Option<super::types::FileDeletePolicy>,
}

#[derive(Debug, Deserialize)]
struct RawReference {
    table: String,
    column: Option<String>,
    #[serde(rename = "as")]
    alias: Option<String>,
    #[serde(rename = "onDelete")]
    on_delete: Option<ReferentialAction>,
    #[serde(rename = "onUpdate")]
    on_update: Option<ReferentialAction>,
}

#[derive(Debug, Deserialize)]
struct RawIndex {
    name: Option<String>,
    columns: Vec<String>,
    unique: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_schema() {
        let yaml = r#"
version: 1
tables:
  users:
    connection: main
    id:
      name: id
      generate: ulid
    columns:
      email:
        type: string
        nullable: false
        unique: true
      created_at:
        type: timestamp
        nullable: false
        default: now
"#;

        let tables = SchemaParser::parse_yaml(yaml).unwrap();
        assert_eq!(tables.len(), 1);

        let users = &tables[0];
        assert_eq!(users.name, "users");
        assert_eq!(users.connection, "main");
        assert_eq!(users.id.name, "id");
        assert_eq!(users.columns.len(), 2);
    }

    #[test]
    fn test_parse_with_references() {
        let yaml = r#"
version: 1
tables:
  users:
    id:
      generate: ulid
    columns:
      email:
        type: string
  posts:
    id:
      generate: ulid
    columns:
      user_id:
        type: string
        references:
          table: users
          as: author
          onDelete: cascade
"#;

        let tables = SchemaParser::parse_yaml(yaml).unwrap();
        let schema = SchemaParser::build_project_schema(tables).unwrap();

        let posts = schema.find_table("posts").unwrap();
        let user_id = posts.find_column("user_id").unwrap();

        let reference = user_id.references.as_ref().unwrap();
        assert_eq!(reference.table, "users");
        assert_eq!(reference.alias, Some("author".to_string()));
        assert_eq!(reference.on_delete, ReferentialAction::Cascade);
    }

    #[test]
    fn test_parse_array_type() {
        let yaml = r#"
version: 1
tables:
  posts:
    id:
      generate: ulid
    columns:
      tags:
        type: array
        items: string
"#;

        let tables = SchemaParser::parse_yaml(yaml).unwrap();
        let posts = &tables[0];
        let tags = posts.find_column("tags").unwrap();

        match &tags.column_type {
            ColumnType::Array { items } => {
                assert!(matches!(items.as_ref(), ColumnType::String));
            }
            _ => panic!("Expected array type"),
        }
    }

    #[test]
    fn test_duplicate_table_error() {
        let tables = vec![
            Table {
                name: "users".to_string(),
                connection: "main".to_string(),
                id: IdColumn::default(),
                columns: vec![],
                indexes: vec![],
            },
            Table {
                name: "users".to_string(),
                connection: "main".to_string(),
                id: IdColumn::default(),
                columns: vec![],
                indexes: vec![],
            },
        ];

        let result = SchemaParser::build_project_schema(tables);
        assert!(result.is_err());
    }
}
