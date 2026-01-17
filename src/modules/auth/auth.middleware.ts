import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { V3 } from "paseto";
import { config } from "@/config/index.js";

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
        const key = Buffer.from(config.auth.pasetoKey, "hex");
        const payload: any = await V3.decrypt(token, key);

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
        c.set("jwtPayload", payload); // name kept as jwtPayload for compatibility or rename? renaming might break other things so keeping it as variable name is safer for now.

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
