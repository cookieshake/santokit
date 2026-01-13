import { userRepository } from './user.repository.js'
import { sign } from 'hono/jwt'
import { config } from '@/config/index.js'

export const userService = {
    createUser: async (projectId: number, data: any) => {
        return await userRepository.create(projectId, {
            ...data,
            roles: data.roles || ['user']
        })
    },

    listUsers: async (projectId: number) => {
        return await userRepository.findByProjectId(projectId)
    },

    deleteUser: async (projectId: number, userId: number) => {
        return await userRepository.delete(projectId, userId)
    },

    login: async (projectId: number, email: string, password: string) => {
        const user = await userRepository.findByEmail(projectId, email)
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
