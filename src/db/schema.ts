



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

// Collections table removed - using dynamic introspection


// Casbin Rules for Authorization
// Casbin table removed

