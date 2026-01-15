import { db } from '../db/index.js'
import { accounts } from '../db/schema.js'
import { arrayContains, eq } from 'drizzle-orm'
import { config } from '../config/index.js'
import { hashPassword } from './password.js'


export async function ensureAdminExists() {
    console.log('Checking for admin accounts...')

    try {
        // Check if any admin exists
        const admins = await db.select()
            .from(accounts)
            .where(arrayContains(accounts.roles, ['admin']))
            .limit(1)

        if (admins && admins.length > 0) {
            console.log('Admin account found.')
            return
        }

        console.log('No admin account found. Creating default admin...')
        const { email, password, name } = config.auth.initialAdmin

        const hashedPassword = await hashPassword(password)

        await db.insert(accounts).values({
            id: crypto.randomUUID(),
            email,
            password: hashedPassword,
            name: name,
            roles: ['admin'],
        })

        console.log('Default admin account created successfully!')
        console.log(`Email: ${email}`)
        console.log('Please change the default password after your first login.')

    } catch (error) {
        console.error('Failed to ensure admin exists:', error)
    }
}

