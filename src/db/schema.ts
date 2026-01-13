
import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

// Users
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    role: text('role').notNull().default('user'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Data Sources
export const dataSources = pgTable('data_sources', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    connectionString: text('connection_string').notNull(),
    prefix: text('prefix').notNull().default('santoki_'), // Default for backward compat
    createdAt: timestamp('created_at').defaultNow(),
});

// Projects
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    ownerId: integer('owner_id').references(() => users.id),
    dataSourceId: integer('data_source_id').references(() => dataSources.id).unique(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Collections (Logical Tables)
export const collections = pgTable('collections', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id).notNull(),
    name: text('name').notNull(), // Logical name e.g. 'posts'
    physicalName: text('physical_name').notNull(), // Physical name e.g. 'p1_posts'
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.projectId, t.name),
}));

