import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    ...(!process.env.DATABASE_URL ? { driver: 'pglite' as any } : {}),
    dbCredentials: {
        url: process.env.DATABASE_URL || './.pglite',
    },
});
