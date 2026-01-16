import { db } from '../db/index.js'
// accounts import removed
import { sql } from 'drizzle-orm'
import { config } from '../config/index.js'
import { hashPassword } from './password.js'
import { CONSTANTS } from '../constants.js'


export async function ensureAdminExists() {
    console.log('Checking for admin accounts...')

    try {
        // Check if any admin exists
        // Ensure system accounts table exists
        // const { ACCOUNTS_TABLE_SQL } = await import('../modules/account/account-schema.js')
        // await db.execute(sql.raw(ACCOUNTS_TABLE_SQL))

        // Check if any admin exists using raw SQL since accounts is not in schema anymore
        // or use accountRepository if possible, but accountRepository.findByProjectId('system') is cleaner
        const { accountRepository } = await import('../modules/account/account.repository.js')
        const admins = await accountRepository.findByProjectId(CONSTANTS.PROJECTS.SYSTEM_ID)
        const adminExists = admins.some((a: any) =>
            Array.isArray(a.roles) && a.roles.includes('admin')
        )

        if (adminExists) {
            console.log('Admin account found.')
            return
        }

        console.log('No admin account found. Creating default admin...')
        const { email, password, name } = config.auth.initialAdmin
        const hashedPassword = await hashPassword(password)

        await accountRepository.create(CONSTANTS.PROJECTS.SYSTEM_ID, {
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
