import { db } from '../../db/index.js';
import { collections } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { connectionManager } from '../../db/connection-manager.js';
import { dataSourceRepository } from '../datasource/datasource.repository.js';
import { sql } from 'drizzle-orm';
export const collectionRepository = {
    create: async (data) => {
        return (await db.insert(collections).values(data).returning())[0];
    },
    findByProjectAndName: async (projectId, name) => {
        return await db.query.collections.findFirst({
            where: and(eq(collections.projectId, projectId), eq(collections.name, name))
        });
    },
    findByProject: async (projectId) => {
        return await db.query.collections.findMany({
            where: eq(collections.projectId, projectId)
        });
    },
    // Physical Table Operations
    createPhysicalTable: async (dataSourceName, physicalName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect to data source');
        await targetDb.execute(sql.raw(`CREATE TABLE "${physicalName}" (id SERIAL PRIMARY KEY, created_at TIMESTAMP DEFAULT NOW())`));
    },
    // Field Operations
    getFields: async (dataSourceName, physicalName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        return (await targetDb.execute(sql.raw(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = '${physicalName}'
        `))).rows;
    },
    addField: async (dataSourceName, physicalName, fieldName, type, isNullable) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        let sqlType = 'TEXT';
        if (type === 'integer')
            sqlType = 'INTEGER';
        if (type === 'boolean')
            sqlType = 'BOOLEAN';
        let sqlNullable = isNullable ? 'NULL' : 'NOT NULL';
        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "${fieldName}" ${sqlType} ${sqlNullable}`));
    },
    removeField: async (dataSourceName, physicalName, fieldName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" DROP COLUMN "${fieldName}"`));
    },
    renameField: async (dataSourceName, physicalName, oldName, newName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" RENAME COLUMN "${oldName}" TO "${newName}"`));
    },
    // Index Operations
    getIndexes: async (dataSourceName, physicalName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        return (await targetDb.execute(sql.raw(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = '${physicalName}'
        `))).rows;
    },
    createIndex: async (dataSourceName, physicalName, indexName, columns, unique) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        const columnsStr = columns.map(f => `"${f}"`).join(', ');
        const uniqueStr = unique ? 'UNIQUE' : '';
        await targetDb.execute(sql.raw(`CREATE ${uniqueStr} INDEX "${indexName}" ON "${physicalName}" (${columnsStr})`));
    },
    removeIndex: async (dataSourceName, indexName) => {
        const targetDb = await connectionManager.getConnection(dataSourceName);
        if (!targetDb)
            throw new Error('Could not connect');
        await targetDb.execute(sql.raw(`DROP INDEX "${indexName}"`));
    }
};
