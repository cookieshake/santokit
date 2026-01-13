import { accountRepository } from './account.repository.js'
import { sign } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'secret'

export const accountService = {
    createAccount: async (projectId: number, data: any) => {
        return await accountRepository.create(projectId, {
            ...data,
            role: data.role || 'user'
        })
    },

    listAccounts: async (projectId: number) => {
        return await accountRepository.findByProjectId(projectId)
    },

    deleteAccount: async (projectId: number, accountId: number) => {
        return await accountRepository.delete(projectId, accountId)
    },

    login: async (projectId: number, email: string, password: string) => {
        const account = await accountRepository.findByEmail(projectId, email)
        if (!account || account.password !== password) {
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: account.id,
            email: account.email,
            role: account.role,
            projectId: projectId,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        }

        const token = await sign(payload, JWT_SECRET)
        return { account, token }
    }
}
