import { db } from '../db/index.js'
import { config } from '../config/index.js'
import { hashPassword } from './password.js'


export async function ensureAdminExists() {
    console.log('Checking for admin accounts...')

    try {
        // Initial setup is now simpler - admin accounts are managed per-project
        // via the UI or API. This function can be used to ensure schema is ready.
        console.log('Admin setup is now managed per-project via UI/API.')
        console.log('Create a project with a database and register an admin user.')
    } catch (error) {
        console.error('Failed to initialize:', error)
    }

}
