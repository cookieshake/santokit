
export const config = {
    db: {
        url: process.env.DATABASE_URL,
    },
    auth: {
        adminUrl: process.env.BETTER_AUTH_URL || 'http://localhost:3000/admin/v1/auth',
        pasetoKey: process.env.PASETO_KEY || '707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f',
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
