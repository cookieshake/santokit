



import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

// Admins table removed, users table used instead with role='admin'

// Data Sources table removed, merged into projects

// Projects
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    connectionString: text('connection_string').notNull(),
    prefix: text('prefix').notNull().default('santoki_'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Collections (Logical Tables)
export const collections = pgTable('collections', {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id).notNull(),
    name: text('name').notNull(), // Logical name e.g. 'posts'
    physicalName: text('physical_name').notNull(), // Physical name e.g. 'p1_posts'
    idType: text('id_type').notNull().default('serial'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.projectId, t.name),
}));

// Casbin Rules for Authorization
// Casbin table removed

