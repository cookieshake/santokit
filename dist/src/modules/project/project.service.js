import { projectRepository } from '@/modules/project/project.repository.js';
export const projectService = {
    create: async (name, ownerId) => {
        return await projectRepository.create({ name, ownerId });
    },
    list: async () => {
        return await projectRepository.findAll();
    },
    getById: async (id) => {
        return await projectRepository.findById(id);
    }
};
