import { hashPassword, verifyPassword } from '@/lib/password.js'
import { tokenService } from '@/lib/token.js'
import { collectionService } from '@/modules/collection/collection.service.js'

import { accountRepository } from './account.repository.js'

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
    return await accountRepository.create(
      projectId,
      {
        ...rest,
        password: hashedPassword,
        roles: role ? [role] : ['user'],
      },
      collectionName,
    )
  },

  listUsers: async (projectId: string | null, collectionName: string) => {
    return await accountRepository.findByProjectId(projectId, collectionName)
  },

  deleteUser: async (projectId: string | null, accountId: string, collectionName: string) => {
    return await accountRepository.delete(projectId, accountId, collectionName)
  },

  login: async (
    projectId: string | null,
    email: string,
    password: string,
    collectionName: string,
  ) => {
    // console.log(`[AccountService] Login attempt for email: '${email}', projectId: ${projectId}`)
    const user = (await accountRepository.findByEmail(projectId, email, collectionName)) as
      | UserRecord
      | undefined
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
        const collectionDetail = await collectionService.getDetail(databaseId, collectionName)
        if (collectionDetail) {
          collectionId = collectionDetail.meta.id
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
      roles: user.roles || [],
      projectId: projectId,
      collectionName: collectionName,
      collectionId: collectionId || undefined,
      exp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24h
    }

    const token = await tokenService.createToken(payload)
    return { user, token }
  },
}
