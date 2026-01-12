import { projectRepository } from './project.repository.js'

export const projectService = {
    create: async (name: string, ownerId: number) => {
        return await projectRepository.create({ name, ownerId })
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: number) => {
        return await projectRepository.findById(id)
    }
}
