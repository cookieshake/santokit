import { accountRepository } from './account.repository.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { V3 } from 'paseto'
import { config } from '@/config/index.js'
import { hashPassword, verifyPassword } from '@/lib/password.js'

interface UserRecord {
    id: string
    email: string
    password: string
    roles: string[] | null
    name?: string | null
}

export const accountService = {
    createUser: async (projectId: string | null, data: any, collectionName: string) => {
        const { role, password, collectionName: _, ...rest } = data
        const passwordStr = typeof password === 'string' ? password : String(password)
        const hashedPassword = await hashPassword(passwordStr)
        return await accountRepository.create(projectId, {
            ...rest,
            password: hashedPassword,
            roles: role ? [role] : ['user']
        }, collectionName)
    },

    listUsers: async (projectId: string | null, collectionName: string) => {
        return await accountRepository.findByProjectId(projectId, collectionName)
    },

    deleteUser: async (projectId: string | null, accountId: string, collectionName: string) => {
        return await accountRepository.delete(projectId, accountId, collectionName)
    },

    login: async (projectId: string | null, email: string, password: string, collectionName: string) => {
        // console.log(`[AccountService] Login attempt for email: '${email}', projectId: ${projectId}`)
        const user = await accountRepository.findByEmail(projectId, email, collectionName) as UserRecord | undefined
        if (!user) {
            console.error(`[AccountService] User not found for email: '${email}'`)
            throw new Error('Invalid credentials')
        }

        const validPassword = await verifyPassword(String(user.password), password)
        if (!validPassword) {
            console.error(`[AccountService] Password mismatch for email: '${email}'`)
            throw new Error('Invalid credentials')
        }

        let collectionId: string | null = null
        if (projectId) {
            try {
                const databaseId = await accountRepository.getDatabaseId(projectId)
                const collection = await collectionRepository.findByName(databaseId, collectionName)
                if (collection) {
                    collectionId = collection.id
                }
            } catch (e) {
                // Ignore errors if collection metadata not found, though login succeeded implies it exists physically?
                // Actually findByEmail uses getContext which checks existence.
                // So here re-fetching mostly to get ID.
                console.warn('[AccountService] Failed to resolve collection ID', e)
            }
        }

        const payload = {
            id: user.id,
            email: user.email,
            roles: user.roles,
            projectId: projectId,
            collectionName: collectionName,
            collectionId: collectionId,
            exp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24h
        }

        const key = Buffer.from(config.auth.pasetoKey, 'hex')
        const token = await V3.encrypt(payload, key)
        return { user, token }
    }
}
