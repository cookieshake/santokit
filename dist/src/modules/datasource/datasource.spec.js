import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema.js';
import { dataSourceService } from '@/modules/datasource/datasource.service.js';
import { sql } from 'drizzle-orm';
vi.mock('../../db/index.js', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const schema = await import('../../db/schema.js');
    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });
    return { db, pglite };
});
import * as dbModule from '@/db/index.js';
const { db, pglite } = dbModule;
const pgliteInstance = pglite;
describe('DataSource Service (Integration)', () => {
    beforeEach(async () => {
        await pgliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        connection_string TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT 'santoki_',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
        await db.execute(sql `TRUNCATE TABLE data_sources RESTART IDENTITY CASCADE`);
    });
    it('should create a new data source', async () => {
        const source = await dataSourceService.create('My DB', 'postgres://localhost:5432/db');
        expect(source).toBeDefined();
        expect(source.name).toBe('My DB');
    });
    it('should list data sources', async () => {
        await dataSourceService.create('DB 1', 'postgres://1');
        await dataSourceService.create('DB 2', 'postgres://2');
        const list = await dataSourceService.list();
        expect(list.length).toBe(2);
    });
});
