import { accountRepository } from './account.repository.js'
import { sign } from 'hono/jwt'
import { config } from '@/config/index.js'

export const accountService = {
    createUser: async (projectId: number | string, data: any) => {
        return await accountRepository.create(projectId, {
            ...data,
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
        if (!user || user.password !== password) {
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: user.id,
            email: user.email,
            roles: user.roles,
            projectId: projectId,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        }

        const token = await sign(payload, config.auth.jwtSecret)
        return { user, token }
    }
}
