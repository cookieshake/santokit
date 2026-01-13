import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    role: text('role'),
    banned: boolean('banned'),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id),
});

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
});

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
});

// Admins (System Level Users)
export const admins = pgTable('admins', {
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
    ownerId: integer('owner_id').references(() => admins.id),
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

