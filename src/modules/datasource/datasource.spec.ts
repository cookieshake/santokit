import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { dataSourceService } from '@/modules/datasource/datasource.service.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
    const { createTestDb } = await import('../../tests/db-setup.js')
    return await createTestDb()
})

import * as dbModule from '@/db/index.js'
const { db, pglite } = dbModule as any
const pgliteInstance = pglite as any

describe('DataSource Service (Integration)', () => {
    beforeEach(async () => {
        // Schema is already setup by createTestDb in the mock
        await db.execute(sql`TRUNCATE TABLE data_sources RESTART IDENTITY CASCADE`)
    })

    it('should create a new data source', async () => {
        const source = await dataSourceService.create('My DB', 'postgres://localhost:5432/db')
        expect(source).toBeDefined()
        expect(source.name).toBe('My DB')
    })

    it('should list data sources', async () => {
        await dataSourceService.create('DB 1', 'postgres://1')
        await dataSourceService.create('DB 2', 'postgres://2')

        const list = await dataSourceService.list()
        expect(list.length).toBe(2)
    })
})
