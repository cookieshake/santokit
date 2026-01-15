
import { db as adminDb, type Database } from '@/db/index.js';
import { projects } from '@/db/schema.js';
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
        const project = await adminDb.query.projects.findFirst({
            where: eq(projects.name, sourceName)
        });

        if (!project) return null;

        // 3. Validate connection string
        if (!project.connectionString.startsWith('postgres://') &&
            !project.connectionString.startsWith('postgresql://')) {
            throw new Error(`Invalid connection string for project "${sourceName}". Only PostgreSQL connections are supported.`);
        }

        // 4. Create new pool
        const { Pool } = await import('pg');
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const pool = new Pool({
            connectionString: project.connectionString
        });
        const dbInstance = drizzle(pool) as unknown as Database;
        // Store the raw pool on the instance for closing
        (dbInstance as any)._raw = pool;

        this.instances.set(sourceName, dbInstance);
        return dbInstance;
    }

    // Optional: method to close specific pool or all
    async close(sourceName: string) {
        const instance = this.instances.get(sourceName);
        if (instance) {
            const raw = (instance as any)._raw;
            if (raw && typeof raw.end === 'function') {
                await raw.end();
            }
            this.instances.delete(sourceName);
        }
    }
}

export const connectionManager = new ConnectionManager();
