export interface CollectionMetadata {
  id: number
  name: string
  physicalName: string
  type: 'base' | 'auth'
  createdAt: Date
  updatedAt: Date
}
