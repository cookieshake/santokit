
import { db as adminDb, type Database } from '@/db/index.js';
import { projects, databases } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

// Singleton to hold active pools
class ConnectionManager {
    private instances: Map<string, Database> = new Map();

    async getConnection(databaseId: number): Promise<Database | null> {
        // 1. Check if we already have an instance
        const key = String(databaseId);
        if (this.instances.has(key)) {
            return this.instances.get(key)!;
        }

        // 2. Fetch config from Admin DB
        const database = await adminDb.query.databases.findFirst({
            where: eq(databases.id, databaseId)
        });

        if (!database) return null;

        // 3. Validate connection string
        if (!database.connectionString.startsWith('postgres://') &&
            !database.connectionString.startsWith('postgresql://')) {
            throw new Error(`Invalid connection string for database "${database.name}". Only PostgreSQL connections are supported.`);
        }

        // 4. Create new pool
        const { Pool } = await import('pg');
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const pool = new Pool({
            connectionString: database.connectionString
        });
        const dbInstance = drizzle(pool) as unknown as Database;
        // Store the raw pool on the instance for closing
        (dbInstance as any)._raw = pool;

        this.instances.set(key, dbInstance);
        return dbInstance;
    }

    // Optional: method to close specific pool or all
    async close(databaseId: number) {
        const key = String(databaseId);
        const instance = this.instances.get(key);
        if (instance) {
            const raw = (instance as any)._raw;
            if (raw && typeof raw.end === 'function') {
                await raw.end();
            }
            this.instances.delete(key);
        }
    }
}

export const connectionManager = new ConnectionManager();
