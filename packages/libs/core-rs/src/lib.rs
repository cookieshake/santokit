use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Schema {
    pub version: u32,
    pub tables: HashMap<String, Table>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Table {
    pub connection: String,
    #[serde(default)]
    pub id: IdColumn, // id is optional? No, "All tables have single PK". But maybe default works? Spec says "PK column is defined as tables.<name>.id (recommended)". If missing, maybe default? Spec says "id: { name: id, ... }". Let's assume it's required or has default.
    // Spec: "PK column is tables.<name>.id".
    // "id" field in YAML is optional? "id: { ... }"
    // "PK column name default: id".
    // Let's make it optional in struct with default.
    pub columns: HashMap<String, Column>,
    #[serde(default)]
    pub indexes: Vec<Index>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct IdColumn {
    #[serde(default = "default_id_name")]
    pub name: String,
    #[serde(default = "default_id_type")]
    pub r#type: String,
    #[serde(default = "default_generate")]
    pub generate: String,
}

impl Default for IdColumn {
    fn default() -> Self {
        Self {
            name: default_id_name(),
            r#type: default_id_type(),
            generate: default_generate(),
        }
    }
}

fn default_id_name() -> String { "id".to_string() }
fn default_id_type() -> String { "string".to_string() }
fn default_generate() -> String { "ulid".to_string() }

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub r#type: String,
    #[serde(default)]
    pub nullable: bool,
    #[serde(default)]
    pub unique: bool,
    pub default: Option<String>,
    pub references: Option<Reference>,

    // Array specific
    // items can be a String (type name) or nested definition.
    // For now we support String.
    pub items: Option<String>,

    // File specific
    pub bucket: Option<String>,
    #[serde(rename = "onDelete")]
    pub on_delete: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Reference {
    pub table: String,
    pub column: Option<String>,
    pub r#as: Option<String>,
    #[serde(rename = "onDelete")]
    pub on_delete: Option<String>,
    #[serde(rename = "onUpdate")]
    pub on_update: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Index {
    pub columns: Vec<String>,
    #[serde(default)]
    pub unique: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_schema() {
        let yaml = r#"
version: 1

tables:
  users:
    connection: main
    id:
      name: id
      type: string
      generate: ulid
    columns:
      email: { type: string, nullable: false, unique: true }
      created_at: { type: timestamp, nullable: false, default: now }
    indexes:
      - columns: [email]
        unique: true
"#;
        let schema: Schema = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(schema.version, 1);
        assert!(schema.tables.contains_key("users"));
        let user_table = schema.tables.get("users").unwrap();
        assert_eq!(user_table.connection, "main");
        assert_eq!(user_table.id.name, "id");
        assert_eq!(user_table.columns.get("email").unwrap().r#type, "string");
        assert_eq!(user_table.columns.get("email").unwrap().unique, true);
        assert_eq!(user_table.indexes.len(), 1);
    }

    #[test]
    fn test_parse_fk() {
        let yaml = r#"
version: 1
tables:
  posts:
    connection: main
    id: { name: id, type: string, generate: ulid }
    columns:
      user_id:
        type: string
        nullable: false
        references:
          table: users
          as: user
          onDelete: cascade
          onUpdate: restrict
"#;
        let schema: Schema = serde_yaml::from_str(yaml).unwrap();
        let posts = schema.tables.get("posts").unwrap();
        let user_id = posts.columns.get("user_id").unwrap();
        let refs = user_id.references.as_ref().unwrap();
        assert_eq!(refs.table, "users");
        assert_eq!(refs.r#as, Some("user".to_string()));
        assert_eq!(refs.on_delete, Some("cascade".to_string()));
    }
}
