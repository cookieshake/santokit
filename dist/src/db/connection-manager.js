import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { db as adminDb } from '@/db/index.js';
import { dataSources } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
// Singleton to hold active pools
class ConnectionManager {
    pools = new Map();
    async getConnection(sourceName) {
        // 1. Check if we already have a pool
        if (this.pools.has(sourceName)) {
            return drizzle(this.pools.get(sourceName));
        }
        // 2. Fetch config from Admin DB
        const source = await adminDb.query.dataSources.findFirst({
            where: eq(dataSources.name, sourceName)
        });
        if (!source)
            return null;
        // 3. Create new pool
        const newPool = new Pool({
            connectionString: source.connectionString
        });
        this.pools.set(sourceName, newPool);
        return drizzle(newPool);
    }
    // Optional: method to close specific pool or all
    async close(sourceName) {
        const pool = this.pools.get(sourceName);
        if (pool) {
            await pool.end();
            this.pools.delete(sourceName);
        }
    }
}
export const connectionManager = new ConnectionManager();
