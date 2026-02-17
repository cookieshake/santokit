use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "releases")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub project: String,
    pub env: String,
    #[sea_orm(column_name = "ref")]
    pub ref_name: String,
    pub schema_json: String,
    pub permissions_yaml: String,
    pub storage_yaml: String,
    pub logics_json: String,
    pub created_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
