import { adminRepository } from './admin.repository.js'
import { sign } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'secret'

export class AdminService {
    async register(data: any) {
        // In a real app, hash password here
        return adminRepository.create({
            ...data,
            roles: ['admin'] // Force admin for now as per requirement
        })
    }

    async login(email: string, password: string) {
        const admin = await adminRepository.findByEmail(email)
        if (!admin || admin.password !== password) {
            throw new Error('Invalid credentials')
        }

        const payload = {
            id: admin.id,
            email: admin.email,
            roles: admin.roles,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        }

        const token = await sign(payload, JWT_SECRET)
        return { user: admin, token }
    }
}

export const adminService = new AdminService()
