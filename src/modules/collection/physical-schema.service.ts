
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { previewRawSql } from './sql-preview.js'

export const physicalSchemaService = {
    /**
     * Creates the physical table and returns executed SQL or generated SQL (if dryRun)
     */
    createTable: async (
        databaseId: string,
        physicalName: string,
        idType: 'serial' | 'uuid' | 'text' | 'typeid',
        dryRun: boolean
    ): Promise<string | void> => {
        return collectionRepository.createPhysicalTable(databaseId, physicalName, idType, dryRun)
    },

    /**
     * Adds default authentication fields to the physical table
     */
    addAuthFields: async (
        databaseId: string,
        physicalName: string,
        dryRun: boolean
    ): Promise<string[]> => {
        const sqls: string[] = []

        if (dryRun) {
            sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "email" TEXT NOT NULL`))
            sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "password" TEXT NOT NULL`))
            sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "name" TEXT NOT NULL`))
            sqls.push(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`)
            sqls.push(previewRawSql(`CREATE UNIQUE INDEX "${physicalName}_email_idx" ON "${physicalName}" ("email")`))
            return sqls
        }

        await collectionRepository.addField(databaseId, physicalName, 'email', 'text', false)
        await collectionRepository.addField(databaseId, physicalName, 'password', 'text', false)
        await collectionRepository.addField(databaseId, physicalName, 'name', 'text', false)
        await collectionRepository.addArrayField(databaseId, physicalName, 'roles', 'TEXT', '{"user"}')
        await collectionRepository.createIndex(databaseId, physicalName, `${physicalName}_email_idx`, ['email'], true)

        return []
    },

    addField: async (
        databaseId: string,
        physicalName: string,
        fieldName: string,
        type: string,
        isNullable: boolean,
        dryRun: boolean
    ) => {
        return collectionRepository.addField(databaseId, physicalName, fieldName, type, isNullable, dryRun)
    },

    removeField: async (
        databaseId: string,
        physicalName: string,
        fieldName: string,
        dryRun: boolean
    ) => {
        return collectionRepository.removeField(databaseId, physicalName, fieldName, dryRun)
    },

    renameField: async (
        databaseId: string,
        physicalName: string,
        oldName: string,
        newName: string,
        dryRun: boolean
    ) => {
        return collectionRepository.renameField(databaseId, physicalName, oldName, newName, dryRun)
    },

    createIndex: async (
        databaseId: string,
        physicalName: string,
        indexName: string,
        fields: string[],
        unique: boolean,
        dryRun: boolean
    ) => {
        return collectionRepository.createIndex(databaseId, physicalName, indexName, fields, unique, dryRun)
    },

    removeIndex: async (
        databaseId: string,
        physicalName: string,
        indexName: string,
        dryRun: boolean
    ) => {
        return collectionRepository.removeIndex(databaseId, indexName, dryRun)
    }
}
