import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

export const accounts = pgTable("accounts", {
    id: text("id").primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(), // Made required for simple email/pass auth
    roles: text('roles').array().notNull().default(['user']),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});



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

