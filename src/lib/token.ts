import { V3 } from 'paseto'

import { config } from '@/config/index.js'
import type { UserPayload } from '@/types/context.js'

const getKey = () => Buffer.from(config.auth.pasetoKey, 'hex')

export const tokenService = {
  createToken: async (payload: UserPayload & { exp?: string | Date }) => {
    const key = getKey()
    // V3.encrypt expects object.
    return await V3.encrypt(payload as any, key)
  },

  verifyToken: async (token: string): Promise<UserPayload> => {
    const key = getKey()
    return (await V3.decrypt(token, key)) as unknown as UserPayload
  },
}
