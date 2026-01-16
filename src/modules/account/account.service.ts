import { accountRepository } from './account.repository.js'
import { V3 } from 'paseto'
import { config } from '@/config/index.js'
import { hashPassword, verifyPassword } from '@/lib/password.js'

export const accountService = {
    createUser: async (projectId: number | string, data: any) => {
        const password = typeof data.password === 'string' ? data.password : String(data.password)
        const hashedPassword = await hashPassword(password)
        return await accountRepository.create(projectId, {
            ...data,
            password: hashedPassword,
            roles: data.roles || ['user']
        })
    },

    listUsers: async (projectId: number | string) => {
        return await accountRepository.findByProjectId(projectId)
    },

    deleteUser: async (projectId: number | string, accountId: number | string) => {
        return await accountRepository.delete(projectId, accountId)
    },

    login: async (projectId: number | string, email: string, password: string) => {
        const user = await accountRepository.findByEmail(projectId, email)
        if (!user) {
            throw new Error('Invalid credentials')
        }

        const validPassword = await verifyPassword(String(user.password), password)
        if (!validPassword) {
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: user.id,
            email: user.email,
            roles: user.roles,
            projectId: projectId,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        }

        const key = Buffer.from(config.auth.pasetoKey, 'hex')
        const token = await V3.encrypt(payload, key)
        return { user, token }
    }
}
