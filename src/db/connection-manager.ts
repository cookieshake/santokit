
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { db as adminDb } from './index.js';
import { dataSources } from './schema.js';
import { eq } from 'drizzle-orm';

// Singleton to hold active pools
class ConnectionManager {
    private pools: Map<string, Pool> = new Map();

    async getConnection(sourceName: string): Promise<NodePgDatabase | null> {
        // 1. Check if we already have a pool
        if (this.pools.has(sourceName)) {
            return drizzle(this.pools.get(sourceName)!);
        }

        // 2. Fetch config from Admin DB
        const source = await adminDb.query.dataSources.findFirst({
            where: eq(dataSources.name, sourceName)
        });

        if (!source) return null;

        // 3. Create new pool
        const newPool = new Pool({
            connectionString: source.connectionString
        });

        this.pools.set(sourceName, newPool);
        return drizzle(newPool);
    }

    // Optional: method to close specific pool or all
    async close(sourceName: string) {
        const pool = this.pools.get(sourceName);
        if (pool) {
            await pool.end();
            this.pools.delete(sourceName);
        }
    }
}

export const connectionManager = new ConnectionManager();
