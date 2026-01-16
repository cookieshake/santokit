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
        // Ensure System Project Exists
        // const { ACCOUNTS_TABLE_SQL } = await import('../modules/account/account-schema.js')
        // await db.execute(sql.raw(ACCOUNTS_TABLE_SQL))
        const { projectRepository } = await import('../modules/project/project.repository.js')
        const { projectService } = await import('../modules/project/project.service.js')

        let systemProject = await projectRepository.findById(1) // Assuming ID 1 is reserved or verify by name
        // Or better check by name
        const projects = await projectRepository.findAll()
        systemProject = projects.find(p => p.name === CONSTANTS.PROJECTS.SYSTEM_ID)

        if (!systemProject) {
            console.log('System project not found. Creating...')
            // We need a connection string for the system project effectively pointing to the same DB
            // Typically logic handles this.
            // Using projectService.create might try to init data source which calls collectionService
            // Let's rely on projectService.create
            systemProject = await projectService.create(CONSTANTS.PROJECTS.SYSTEM_ID, config.db.url!, 'santoki_sys_')
            console.log('System project created.')
        }

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
