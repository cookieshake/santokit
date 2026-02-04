use core_rs::{Schema, Table, Index};
use sea_query::{Table as TableQuery, ColumnDef, PostgresQueryBuilder, Index as IndexQuery, Iden, ForeignKey, ForeignKeyAction};

// Wrapper for sea-query Iden
struct SimpleIden(String);
impl Iden for SimpleIden {
    fn unquoted(&self, s: &mut dyn std::fmt::Write) {
        write!(s, "{}", self.0).unwrap();
    }
}

pub struct DdlGenerator;

impl DdlGenerator {
    pub fn generate(schema: &Schema) -> Vec<String> {
        let mut sqls = Vec::new();
        let mut tables: Vec<_> = schema.tables.iter().collect();
        tables.sort_by_key(|(k, _)| *k);

        for (table_name, table) in tables {
            let stmt = Self::create_table(table_name, table);
            sqls.push(stmt.to_string(PostgresQueryBuilder));

            for index in &table.indexes {
                let idx_stmt = Self::create_index(table_name, index);
                sqls.push(idx_stmt.to_string(PostgresQueryBuilder));
            }
        }
        sqls
    }

    fn create_table(name: &str, table: &Table) -> sea_query::TableCreateStatement {
        let mut stmt = TableQuery::create();
        stmt.table(SimpleIden(name.to_string()))
            .if_not_exists();

        // Add ID column
        let mut id_col = ColumnDef::new(SimpleIden(table.id.name.clone()));
        match table.id.r#type.as_str() {
            "string" => { id_col.text(); },
            "bigint" => { id_col.big_integer(); },
            _ => { id_col.text(); },
        }
        id_col.not_null().primary_key();

        if table.id.generate == "auto_increment" {
             id_col.auto_increment();
        }
        stmt.col(&mut id_col);

        // Sort columns for deterministic output
        let mut columns: Vec<_> = table.columns.iter().collect();
        columns.sort_by_key(|(k, _)| *k);

        for (col_name, col) in columns {
            if col_name == &table.id.name { continue; }

            let mut col_def = ColumnDef::new(SimpleIden(col_name.clone()));
            Self::map_type(&mut col_def, &col.r#type);

            if !col.nullable {
                col_def.not_null();
            }
            if col.unique {
                col_def.unique_key();
            }

            // FK
            if let Some(ref fk) = col.references {
                 let fk_col = fk.column.clone().unwrap_or_else(|| "id".to_string());

                 let mut fk_stmt = ForeignKey::create();
                 fk_stmt.from(SimpleIden(name.to_string()), SimpleIden(col_name.clone()))
                        .to(SimpleIden(fk.table.clone()), SimpleIden(fk_col))
                        .on_delete(Self::map_fk_action(fk.on_delete.as_deref()))
                        .on_update(Self::map_fk_action(fk.on_update.as_deref()));

                 stmt.foreign_key(&mut fk_stmt);
            }

            stmt.col(&mut col_def);
        }

        stmt
    }

    fn map_type(col_def: &mut ColumnDef, type_name: &str) {
        match type_name {
            "string" | "file" => { col_def.text(); },
            "int" => { col_def.integer(); },
            "bigint" => { col_def.big_integer(); },
            "float" => { col_def.double(); },
            "decimal" => { col_def.decimal(); },
            "boolean" => { col_def.boolean(); },
            "json" | "array" => { col_def.json_binary(); },
            "timestamp" => { col_def.timestamp_with_time_zone(); },
            "bytes" => { col_def.binary(); },
            _ => { col_def.text(); },
        }
    }

    fn map_fk_action(action: Option<&str>) -> ForeignKeyAction {
        match action {
            Some("cascade") => ForeignKeyAction::Cascade,
            Some("set_null") => ForeignKeyAction::SetNull,
            Some("restrict") => ForeignKeyAction::Restrict,
            Some("no_action") => ForeignKeyAction::NoAction,
            Some("set_default") => ForeignKeyAction::SetDefault,
            _ => ForeignKeyAction::Restrict,
        }
    }

    fn create_index(table_name: &str, index: &Index) -> sea_query::IndexCreateStatement {
        let mut stmt = IndexQuery::create();
        let idx_name = format!("idx_{}_{}", table_name, index.columns.join("_"));
        stmt.name(&idx_name)
            .table(SimpleIden(table_name.to_string()));

        for col in &index.columns {
            stmt.col(SimpleIden(col.clone()));
        }

        if index.unique {
            stmt.unique();
        }
        stmt
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_rs::{Schema, Table, IdColumn, Column, Index, Reference};
    use std::collections::HashMap;

    #[test]
    fn test_generate_ddl() {
        let mut columns = HashMap::new();
        columns.insert("email".to_string(), Column {
            r#type: "string".to_string(),
            nullable: false,
            unique: true,
            default: None,
            references: None,
            items: None,
            bucket: None,
            on_delete: None,
        });

        columns.insert("group_id".to_string(), Column {
            r#type: "string".to_string(),
            nullable: false,
            unique: false,
            default: None,
            references: Some(Reference {
                table: "groups".to_string(),
                column: None, // defaults to id
                r#as: None,
                on_delete: Some("cascade".to_string()),
                on_update: None,
            }),
            items: None,
            bucket: None,
            on_delete: None,
        });

        let table = Table {
            connection: "main".to_string(),
            id: IdColumn::default(),
            columns,
            indexes: vec![Index {
                columns: vec!["email".to_string()],
                unique: true,
            }],
        };

        let mut tables = HashMap::new();
        tables.insert("users".to_string(), table);

        let schema = Schema {
            version: 1,
            tables,
        };

        let sqls = DdlGenerator::generate(&schema);
        assert_eq!(sqls.len(), 2);

        let create_table = &sqls[0];
        println!("{}", create_table);

        assert!(create_table.contains("CREATE TABLE IF NOT EXISTS \"users\""));
        assert!(create_table.contains("\"id\" text NOT NULL PRIMARY KEY"));
        assert!(create_table.contains("\"email\" text NOT NULL UNIQUE"));

        // Verify FK
        // sea-query generates something like: FOREIGN KEY ("group_id") REFERENCES "groups" ("id") ON DELETE CASCADE ON UPDATE RESTRICT
        assert!(create_table.contains("FOREIGN KEY (\"group_id\") REFERENCES \"groups\" (\"id\")"));
        assert!(create_table.contains("ON DELETE CASCADE"));

        // Index
        assert!(sqls[1].contains("CREATE UNIQUE INDEX \"idx_users_email\" ON \"users\""));
    }
}
