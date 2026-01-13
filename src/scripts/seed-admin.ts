import { authAdmin } from '../lib/auth-admin.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'

async function createAdmin() {
    const email = "admin@example.com"
    const password = "password123"
    const name = "Default Admin"

    console.log(`Creating admin account: ${email}...`)

    try {
        // Check if user already exists
        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (existing.length > 0) {
            console.log("Admin account already exists. Updating roles...")
            await db.update(users)
                .set({ roles: ['admin'] })
                .where(eq(users.id, existing[0].id))
            console.log("Role updated to ['admin'].")
            return
        }

        const user = await authAdmin.api.signUpEmail({
            body: {
                email,
                password,
                name,
            }
        })

        if (user) {
            // Better-auth might not set the 'roles' array correctly if it's customized in schema
            // So we manually set it to ['admin'] after creation just in case
            await db.update(users)
                .set({ roles: ['admin'] })
                .where(eq(users.email, email))

            console.log("Admin account created successfully!")
            console.log(`Email: ${email}`)
            console.log(`Password: ${password}`)
        }
    } catch (e) {
        console.error("Failed to create admin account:", e)
    } finally {
        process.exit(0)
    }
}

createAdmin()
