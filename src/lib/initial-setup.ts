import { authAdmin } from './auth-admin.js'
import { db } from '../db/index.js'
import { accounts } from '../db/schema.js'
import { arrayContains, eq } from 'drizzle-orm'
import { config } from '../config/index.js'


export async function ensureAdminExists() {
    console.log('Checking for admin accounts...')

    try {
        // Check if any admin exists
        const admins = await db.select()
            .from(accounts)
            .where(arrayContains(accounts.roles, ['admin']))
            .limit(1)

        if (admins.length > 0) {
            console.log('Admin account found.')
            return
        }

        console.log('No admin account found. Creating default admin...')
        const { email, password, name } = config.auth.initialAdmin

        const user = await authAdmin.api.signUpEmail({
            body: {
                email,
                password,
                name,
            }
        })

        if (user) {
            // Ensure roles are set correctly
            await db.update(accounts)
                .set({ roles: ['admin'] })
                .where(eq(accounts.email, email))



            console.log('Default admin account created successfully!')
            console.log(`Email: ${email}`)
            console.log('Please change the default password after your first login.')
        }
    } catch (error) {
        console.error('Failed to ensure admin exists:', error)
    }
}
