



import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

// Admins table removed, users table used instead with role='admin'

// Projects
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
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

// Casbin Rules for Authorization
// Casbin table removed

