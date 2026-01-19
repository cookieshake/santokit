import { collectionService } from '@/modules/collection/collection.service.js'
import { physicalSchemaService } from '@/modules/collection/physical-schema.service.js'
import { databaseService } from '@/modules/database/database.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'

export const projectService = {
  create: async (name: string) => {
    // 1. Create Project
    const project = await projectRepository.create({ name })
    return project
  },
  list: async () => {
    return await projectRepository.findAll()
  },
  getById: async (id: string) => {
    return await projectRepository.findById(id)
  },
  delete: async (id: string, deleteData: boolean) => {
    const project = await projectRepository.findById(id)
    if (!project) throw new Error('Project not found')

    if (deleteData) {
      const databases = await databaseService.listByProject(id)

      for (const db of databases) {
        // 1. List all collections
        const collections = await collectionService.listByDatabase(db.id)

        // 2. Delete all physical tables
        for (const collection of collections) {
          await physicalSchemaService.dropTable(db.id, collection.physical_name as string)
        }

        // 3. Metadata in Main DB is handled by CASCADE delete on Project
      }
    }

    await projectRepository.delete(id)
  },
}
