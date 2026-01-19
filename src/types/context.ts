export interface UserPayload {
  id: string
  email: string
  roles: string[]
  projectId: string | null
  collectionName?: string
  collectionId?: string
}

export interface AppContext {
  user: UserPayload | null
  account: UserPayload | null
  session?: unknown // Use unknown instead of any if structure is undefined
}

export type Variables = AppContext
