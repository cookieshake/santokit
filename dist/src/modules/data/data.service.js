import { collectionRepository } from '@/modules/collection/collection.repository.js';
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js';
import { connectionManager } from '@/db/connection-manager.js';
import { sql } from 'drizzle-orm';
export const dataService = {
    // Insert Data
    create: async (projectId, collectionName, data) => {
        // 1. Resolve Meta
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName);
        if (!col)
            throw new Error('Collection not found');
        const source = await dataSourceRepository.findById(col.dataSourceId);
        if (!source)
            throw new Error('Data Source not found');
        const targetDb = await connectionManager.getConnection(source.name);
        if (!targetDb)
            throw new Error('Could not connect');
        // 2. Dynamic Insert
        const keys = Object.keys(data);
        const values = Object.values(data);
        // Simple SQL construction (secure enough for internal use, but ideally use query builder dynamic features)
        // using sql.raw for dynamic table/column names is unavoidable but values should be parameterized if possible.
        // Drizzle's `sql` template literal handles parameterization if used correctly, but for fully dynamic ...
        // We will construct the SQL string carefully.
        const cols = keys.map(k => `"${k}"`).join(', ');
        const vals = keys.map(() => `?`).join(', '); // specific to driver, but Drizzle uses ${param} usually. 
        // Actually, with `execute(sql.raw(..))` we might be bypassing parameterization if not careful.
        // Better approach with Drizzle:
        // We can't type-safe insert into unknown table easily.
        // Let's use string checks for keys and rely on driver.
        const valueString = values.map(v => {
            if (typeof v === 'string')
                return `'${v.replace(/'/g, "''")}'`; // basic memory-safe escaping
            return v;
        }).join(', ');
        const query = `INSERT INTO "${col.physicalName}" (${cols}) VALUES (${valueString}) RETURNING id`;
        const result = await targetDb.execute(sql.raw(query));
        return result.rows[0];
    },
    // Query Data
    findAll: async (projectId, collectionName) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName);
        if (!col)
            throw new Error('Collection not found');
        const source = await dataSourceRepository.findById(col.dataSourceId);
        if (!source)
            throw new Error('Data Source not found');
        const targetDb = await connectionManager.getConnection(source.name);
        if (!targetDb)
            throw new Error('Could not connect');
        const result = await targetDb.execute(sql.raw(`SELECT * FROM "${col.physicalName}"`));
        return result.rows;
    }
};
