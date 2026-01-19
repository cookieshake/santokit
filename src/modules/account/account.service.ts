import { accountRepository } from './account.repository.js'
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
    createUser: async (projectId: string | null, data: any) => {
        const password = typeof data.password === 'string' ? data.password : String(data.password)
        const hashedPassword = await hashPassword(password)
        return await accountRepository.create(projectId, {
            ...data,
            password: hashedPassword,
            roles: data.roles || ['user']
        })
    },

    listUsers: async (projectId: string | null) => {
        return await accountRepository.findByProjectId(projectId)
    },

    deleteUser: async (projectId: string | null, accountId: string) => {
        return await accountRepository.delete(projectId, accountId)
    },

    login: async (projectId: string | null, email: string, password: string) => {
        // console.log(`[AccountService] Login attempt for email: '${email}', projectId: ${projectId}`)
        const user = await accountRepository.findByEmail(projectId, email) as UserRecord | undefined
        if (!user) {
            console.error(`[AccountService] User not found for email: '${email}'`)
            throw new Error('Invalid credentials')
        }

        const validPassword = await verifyPassword(String(user.password), password)
        if (!validPassword) {
            console.error(`[AccountService] Password mismatch for email: '${email}'`)
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: user.id,
            email: user.email,
            roles: user.roles,
            projectId: projectId,
            exp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24h
        }

        const key = Buffer.from(config.auth.pasetoKey, 'hex')
        const token = await V3.encrypt(payload, key)
        return { user, token }
    }
}
