import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/db/schema.js";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";

export const getAuthProject = (db: any) => {
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: "pg",
            schema: {
                user: schema.user,
                session: schema.session,
                account: schema.account,
                verification: schema.verification,
            },
        }),
        emailAndPassword: {
            enabled: true,
        },
        user: {
            additionalFields: {
                role: {
                    type: "string",
                    required: false,
                },
            },
        },
    });
};
