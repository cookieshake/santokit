import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
    // Projects table
    await db.schema
        .createTable('projects')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .execute()

    // Databases table
    await db.schema
        .createTable('databases')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('project_id', 'integer', (col) =>
            col.references('projects.id').onDelete('cascade')
        )
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('connection_string', 'text', (col) => col.notNull())
        .addColumn('prefix', 'text', (col) => col.notNull().defaultTo('santoki_'))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .execute()

    // Accounts table
    await db.schema
        .createTable('accounts')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text')
        .addColumn('email', 'text', (col) => col.notNull().unique())
        .addColumn('password', 'text', (col) => col.notNull())
        .addColumn('roles', sql`text[]`)
        .addColumn('project_id', 'integer')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .execute()

    // Policies table
    await db.schema
        .createTable('policies')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('project_id', 'integer', (col) =>
            col.references('projects.id').onDelete('cascade')
        )
        .addColumn('database_id', 'integer', (col) =>
            col.references('databases.id').onDelete('cascade')
        )
        .addColumn('collection_name', 'text', (col) => col.notNull())
        .addColumn('role', 'text', (col) => col.notNull())
        .addColumn('action', 'text', (col) => col.notNull())
        .addColumn('condition', 'text', (col) => col.notNull())
        .addColumn('effect', 'text', (col) => col.notNull().defaultTo('allow'))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .execute()

    // Collections table
    await db.schema
        .createTable('collections')
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('project_id', 'integer', (col) =>
            col.references('projects.id').onDelete('cascade')
        )
        .addColumn('database_id', 'integer', (col) =>
            col.references('databases.id').onDelete('cascade')
        )
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('physical_name', 'text', (col) => col.notNull().unique())
        .addColumn('type', 'text', (col) => col.notNull().defaultTo('base'))
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('collections').execute()
    await db.schema.dropTable('policies').execute()
    await db.schema.dropTable('accounts').execute()
    await db.schema.dropTable('databases').execute()
    await db.schema.dropTable('projects').execute()
}
