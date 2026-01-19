import { db } from '@/db/index.js'

export const collectionRepository = {
  // Metadata Operations (Main DB)
  list: async (databaseId: string) => {
    return await db
      .selectFrom('collections')
      .selectAll()
      .where('database_id', '=', databaseId)
      .execute()
  },

  findByName: async (databaseId: string, name: string) => {
    return await db
      .selectFrom('collections')
      .selectAll()
      .where('database_id', '=', databaseId)
      .where('name', '=', name)
      .executeTakeFirst()
  },

  createMetadata: async (
    id: string,
    projectId: string,
    databaseId: string,
    name: string,
    physicalName: string,
    type: 'base' | 'auth' = 'base',
  ) => {
    return await db
      .insertInto('collections')
      .values({
        id,
        project_id: projectId,
        database_id: databaseId,
        name,
        physical_name: physicalName,
        type,
      })
      .returningAll()
      .execute()
  },

  deleteMetadata: async (databaseId: string, physicalName: string) => {
    await db
      .deleteFrom('collections')
      .where('database_id', '=', databaseId)
      .where('physical_name', '=', physicalName)
      .execute()
  },
}
