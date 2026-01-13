import { authRepository } from './auth.repository.js'
import { sign } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'secret'

export class AuthService {
    async register(data: any) {
        // In a real app, hash password here
        return authRepository.create({
            ...data,
            role: 'admin' // Force admin for now as per requirement
        })
    }

    async login(email: string, password: string) {
        const user = await authRepository.findByEmail(email)
        if (!user || user.password !== password) {
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        }

        const token = await sign(payload, JWT_SECRET)
        return { user, token }
    }
}

export const authService = new AuthService()
