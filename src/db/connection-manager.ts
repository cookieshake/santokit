
import { db as adminDb, type Database } from '@/db/index.js';
import { dataSources } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

// Singleton to hold active pools
class ConnectionManager {
    private instances: Map<string, Database> = new Map();

    async getConnection(sourceName: string): Promise<Database | null> {
        // 1. Check if we already have an instance
        if (this.instances.has(sourceName)) {
            return this.instances.get(sourceName)!;
        }

        // 2. Fetch config from Admin DB
        const source = await adminDb.query.dataSources.findFirst({
            where: eq(dataSources.name, sourceName)
        });

        if (!source) return null;

        let dbInstance: Database;

        // 3. Create new pool or client
        if (source.connectionString.startsWith('postgres://') || source.connectionString.startsWith('postgresql://')) {
            const { Pool } = await import('pg');
            const { drizzle } = await import('drizzle-orm/node-postgres');
            const pool = new Pool({
                connectionString: source.connectionString
            });
            dbInstance = drizzle(pool) as unknown as Database;
            // Store the raw pool on the instance for closing
            (dbInstance as any)._raw = pool;
        } else {
            const { PGlite } = await import('@electric-sql/pglite');
            const { drizzle } = await import('drizzle-orm/pglite');
            const client = new PGlite(source.connectionString);
            dbInstance = drizzle(client) as unknown as Database;
            // Store the raw client on the instance for closing
            (dbInstance as any)._raw = client;
        }

        this.instances.set(sourceName, dbInstance);
        return dbInstance;
    }

    // Optional: method to close specific pool or all
    async close(sourceName: string) {
        const instance = this.instances.get(sourceName);
        if (instance) {
            const raw = (instance as any)._raw;
            if (raw) {
                if (typeof raw.end === 'function') {
                    await raw.end();
                } else if (typeof raw.close === 'function') {
                    await raw.close();
                }
            }
            this.instances.delete(sourceName);
        }
    }
}

export const connectionManager = new ConnectionManager();
