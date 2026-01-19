
import { projectService } from '@/modules/project/project.service.js'
import { accountService } from '@/modules/account/account.service.js'
import { config } from '@/config/index.js'
import { db } from '@/db/index.js'
import { sql } from 'kysely'

async function seed() {
    console.log('Starting seed...')

    try {
        // 1. Check/Create System Project
        // We need to check manually because projectService.create doesn't support upsert/check by name easily for ID 1 specifically if we rely on SERIAL.
        // But since we want "System" to be Project 1, we can try to insert it with ID 1 explicitly via repository if service doesn't allow, 
        // OR just check if *any* project exists.

        // Let's use raw SQL for precise control over ID 1 if needed, or check via repository.
        // For simplicity, let's just create if not exists and assume first one is 1 (after fresh migrate).

        let project1 = await projectService.getById(1)
        if (!project1) {
            console.log('Creating System Project (ID 1)...')
            // Using service might not guarantee ID 1 if others were deleted, but on fresh DB it should be 1.
            // Safe bet: SQL insert with explicit ID to be sure.
            await sql`
                INSERT INTO projects (id, name) 
                VALUES (1, 'System') 
                ON CONFLICT (id) DO NOTHING
            `.execute(db)
            project1 = await projectService.getById(1)
            console.log('System Project created.')
        } else {
            console.log('System Project (ID 1) already exists.')
        }

        if (!project1) throw new Error('Failed to ensure Project 1')

        // 2. Check/Create System Database
        // accountRepository.getContext fails if no database.
        const encodedUrl = encodeURIComponent(config.db.url); // Connection string handling might be needed depending on implementation? 
        // Actually databases table stores connection string text.

        // We need to check if a database exists for project 1.
        // There is no easy "listDatabases(projectId)" in service, but we know repository has it.
        // Let's just try to create it, handling duplication error if needed, 
        // OR just query databases table.

        const databases = await sql`SELECT * FROM databases WHERE project_id = ${project1.id}`.execute(db)

        if (databases.rows.length === 0) {
            console.log('Creating System Database for Project 1...')
            // We use the same connection string as the main DB for the system DB in this simple setup
            await projectService.createDatabase(
                project1.id,
                'System DB',
                config.db.url,
                'sys_' // prefix
            )
            console.log('System Database created.')
        } else {
            console.log('Database for System Project already exists.')
        }

        // 3. Check/Create Admin User
        // Now that Project 1 and DB exist, accountService should work.
        try {
            await accountService.login(project1.id, config.auth.initialAdmin.email, config.auth.initialAdmin.password)
            console.log('Admin user already exists.')
        } catch (e) {
            console.log('Creating Admin User...')
            await accountService.createUser(project1.id, {
                email: config.auth.initialAdmin.email,
                password: config.auth.initialAdmin.password,
                name: config.auth.initialAdmin.name,
                roles: ['admin', 'super_admin']
            })
            console.log('Admin user created.')
        }

        console.log('Seed completed successfully.')
    } catch (e) {
        console.error('Seed failed:', e)
        process.exit(1)
    } finally {
        // await db.destroy() // If needed
        process.exit(0)
    }
}

seed()
