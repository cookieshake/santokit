
import { db as adminDb, type Database } from '@/db/index.js';
import { dataSources } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

// Singleton to hold active pools
class ConnectionManager {
    private pools: Map<string, any> = new Map();

    async getConnection(sourceName: string): Promise<Database | null> {
        // 1. Check if we already have a pool/client
        if (this.pools.has(sourceName)) {
            const poolOrClient = this.pools.get(sourceName);
            if (adminDb.constructor.name.includes('Node')) {
                const { drizzle } = await import('drizzle-orm/node-postgres');
                return drizzle(poolOrClient) as unknown as Database;
            } else {
                const { drizzle } = await import('drizzle-orm/pglite');
                return drizzle(poolOrClient) as unknown as Database;
            }
        }

        // 2. Fetch config from Admin DB
        const source = await adminDb.query.dataSources.findFirst({
            where: eq(dataSources.name, sourceName)
        });

        if (!source) return null;

        // 3. Create new pool or client
        if (source.connectionString.startsWith('postgres://') || source.connectionString.startsWith('postgresql://')) {
            const { Pool } = await import('pg');
            const { drizzle } = await import('drizzle-orm/node-postgres');
            const newPool = new Pool({
                connectionString: source.connectionString
            });
            this.pools.set(sourceName, newPool);
            return drizzle(newPool) as unknown as Database;
        } else {
            const { PGlite } = await import('@electric-sql/pglite');
            const { drizzle } = await import('drizzle-orm/pglite');
            const client = new PGlite(source.connectionString);
            this.pools.set(sourceName, client);
            return drizzle(client) as unknown as Database;
        }
    }

    // Optional: method to close specific pool or all
    async close(sourceName: string) {
        const poolOrClient = this.pools.get(sourceName);
        if (poolOrClient) {
            if (typeof poolOrClient.end === 'function') {
                await poolOrClient.end();
            } else if (typeof poolOrClient.close === 'function') {
                await poolOrClient.close();
            }
            this.pools.delete(sourceName);
        }
    }
}

export const connectionManager = new ConnectionManager();
