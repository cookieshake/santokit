



import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

// Admins table removed, users table used instead with role='admin'

// Projects
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Databases (Project Databases)
export const databases = pgTable('databases', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    connectionString: text('connection_string').notNull(),
    prefix: text('prefix').notNull().default('santoki_'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Accounts
export const accounts = pgTable('accounts', {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    roles: text('roles').array(),
    projectId: integer('project_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Authorization Policies (ABAC)
export const policies = pgTable('policies', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    databaseId: integer('database_id').references(() => databases.id, { onDelete: 'cascade' }),
    collectionName: text('collection_name').notNull(),
    role: text('role').notNull(),         // e.g. 'admin', 'user', 'guest'
    action: text('action').notNull(),     // 'create', 'read', 'update', 'delete'
    condition: text('condition').notNull(), // JSON string or simple logic, e.g. '{"owner_id": "$user.id"}'
    effect: text('effect').notNull().default('allow'), // 'allow' or 'deny'
    createdAt: timestamp('created_at').defaultNow(),
});


// Collections (Metadata)
export const collections = pgTable('collections', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    databaseId: integer('database_id').references(() => databases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    physicalName: text('physical_name').notNull().unique(),
    type: text('type').notNull().default('base'), // 'base' or 'auth'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
