import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { config } from "@/config/index.js";
import { db } from "@/db/index.js";
// accounts import removed
import { eq } from "drizzle-orm";

type AuthEnv = {
    Variables: {
        user: any; // Using any for payload flexibility, or define strict type
        jwtPayload: any;
    };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
    let token = getCookie(c, "auth_token");
    const authHeader = c.req.header("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
    }

    if (!token) {
        c.set("user", null);
        return next();
    }

    try {
        const payload = await verify(token, config.auth.jwtSecret);

        // Optional: Enforcement of projectId matching if needed in future
        // const projectIdHeader = c.req.header("x-project-id");
        // if (projectIdHeader && payload.projectId !== (projectIdHeader === 'system' ? 'system' : parseInt(projectIdHeader))) {
        //      throw new Error("Project mismatch");
        // }

        c.set("user", {
            id: payload.id,
            email: payload.email,
            roles: payload.roles,
            projectId: payload.projectId
        });
        c.set("jwtPayload", payload);

    } catch (e) {
        c.set("user", null);
    }

    return next();
});

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
        return c.json({ message: "Unauthorized" }, 401);
    }
    return next();
});
