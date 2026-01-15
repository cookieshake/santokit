
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db/index.js";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password.js";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { config } from "@/config/index.js";
import { accountRepository } from "@/modules/account/account.repository.js";

const app = new Hono();

app.post(
    "/sign-in",
    zValidator(
        "json",
        z.object({
            email: z.string().email(),
            password: z.string().min(1),
        })
    ),
    async (c) => {
        const { email, password } = c.req.valid("json");
        const projectIdHeader = c.req.header("x-project-id") || "system";
        const projectId = projectIdHeader === "system" ? "system" : parseInt(projectIdHeader);

        try {
            const user = await accountRepository.findByEmail(projectId, email);

            if (!user) {
                return c.json({ message: "Invalid credentials" }, 401);
            }

            const validPassword = await verifyPassword(String(user.password), password);
            if (!validPassword) {
                return c.json({ message: "Invalid credentials" }, 401);
            }

            const payload = {
                id: user.id,
                email: user.email,
                roles: user.roles,
                projectId: projectId,
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
            };

            const token = await sign(payload, config.auth.jwtSecret);

            setCookie(c, "auth_token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Lax",
                path: "/",
                maxAge: 60 * 60 * 24, // 1 day
            });

            return c.json({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    roles: user.roles,
                },
                token: token,
            });

        } catch (error) {
            console.error(error);
            return c.json({ message: "Authentication failed", details: error instanceof Error ? error.message : "Unknown error" }, 401);
        }
    }
);

app.post("/sign-out", async (c) => {
    deleteCookie(c, "auth_token");
    return c.json({ success: true });
});

app.get("/me", async (c) => {
    let token = getCookie(c, "auth_token");
    const authHeader = c.req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
    }

    if (!token) {
        return c.json({ user: null });
    }

    try {
        const payload = await verify(token, config.auth.jwtSecret);
        return c.json({
            user: {
                id: payload.id,
                email: payload.email,
                roles: payload.roles,
                projectId: payload.projectId
            }
        });
    } catch (e) {
        deleteCookie(c, "auth_token");
        return c.json({ user: null });
    }
});

export const authController = app;
