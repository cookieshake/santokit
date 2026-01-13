
export const config = {
    db: {
        url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/santoki_db',
    },
    auth: {
        adminUrl: process.env.BETTER_AUTH_URL || 'http://localhost:3001/admin/v1/auth',
        jwtSecret: process.env.JWT_SECRET || 'secret',
        initialAdmin: {
            email: process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com',
            password: process.env.INITIAL_ADMIN_PASSWORD || 'password123',
            name: process.env.INITIAL_ADMIN_NAME || 'Default Admin',
        },
    },
    server: {
        port: Number(process.env.PORT) || 3000,
    },
} as const;

export type Config = typeof config;
