import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/db/schema.js";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";

export const getAuthProject = (db: any) => {
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: "pg",
            schema: {
                user: schema.users,
                session: schema.sessions,
                account: schema.accounts,
                verification: schema.verifications,
            },
        }),
        emailAndPassword: {
            enabled: true,
        },
        user: {
            additionalFields: {
                roles: {
                    type: "string[]",
                    required: false,
                },
            },
        },
    });
};
