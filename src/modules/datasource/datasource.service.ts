import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'

export const dataSourceService = {
    create: async (name: string, connectionString: string, prefix?: string) => {
        return await dataSourceRepository.create({
            name,
            connectionString,
            prefix: prefix || 'santoki_',
        })
    },
    list: async () => {
        return await dataSourceRepository.findAll()
    }
}
