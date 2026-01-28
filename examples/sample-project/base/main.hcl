# Main Database Schema
# This file defines the primary database schema using HCL format.
# The filename (without .hcl) becomes the database alias: "main"

table "users" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "email" {
    type = varchar(255)
    null = false
  }
  
  column "name" {
    type = varchar(255)
  }
  
  column "avatar_url" {
    type = text
  }
  
  column "roles" {
    type = sql("text[]")
    default = sql("'{}'::text[]")
  }
  
  column "metadata" {
    type = jsonb
    default = sql("'{}'::jsonb")
  }
  
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  column "updated_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
  
  index "users_email_idx" {
    columns = [column.email]
    unique = true
  }
}

table "orders" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "user_id" {
    type = uuid
    null = false
  }
  
  column "status" {
    type = varchar(50)
    default = "pending"
  }
  
  column "total_amount" {
    type = decimal(10, 2)
    null = false
  }
  
  column "items" {
    type = jsonb
    null = false
  }
  
  column "created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  column "updated_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
  
  foreign_key "orders_user_fk" {
    columns = [column.user_id]
    ref_columns = [table.users.column.id]
    on_delete = CASCADE
  }
  
  index "orders_user_id_idx" {
    columns = [column.user_id]
  }
  
  index "orders_status_idx" {
    columns = [column.status]
  }
}
