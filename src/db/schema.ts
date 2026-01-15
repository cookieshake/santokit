import { pgTable, serial, text, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core';

export const accounts = pgTable("accounts", {
    id: text("id").primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    password: text('password'), // Added for credential auth
    roles: text('roles').array().notNull().default(['user']), // Changed to support multiple roles
    banned: boolean('banned'),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    accountId: text('account_id').notNull().references(() => accounts.id),
});

export const oauthAccounts = pgTable("oauth_accounts", {
    id: text("id").primaryKey(),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull().references(() => accounts.id), // Link to internal account
    providerAccountId: text('provider_account_id').notNull(),
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

export const verifications = pgTable("verifications", {
    id: text("id").primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
});

// Admins table removed, users table used instead with role='admin'

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
    dataSourceId: integer('data_source_id').references(() => dataSources.id).unique().notNull(),
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

