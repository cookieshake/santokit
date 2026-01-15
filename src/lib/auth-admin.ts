import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/index.js";
import * as schema from "@/db/schema.js";
import { config } from "@/config/index.js";

export const authAdmin = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: schema.accounts,
            session: schema.sessions,
            account: schema.oauthAccounts,
            verification: schema.verifications,
        },
    }),
    baseURL: config.auth.adminUrl,
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
