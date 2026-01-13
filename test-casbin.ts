import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { newEnforcer } from 'casbin';
import { DrizzleAdapter } from 'casbin-drizzle-adapter';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './src/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPermissions() {
    console.log('--- Initializing In-Memory DB (PGLite) ---');
    const client = new PGlite();
    const db = drizzle(client, { schema });

    console.log('--- Creating casbin_rule table ---');
    await client.query(`
        CREATE TABLE IF NOT EXISTS "casbin_rule" (
            "id" SERIAL PRIMARY KEY,
            "ptype" TEXT,
            "v0" TEXT,
            "v1" TEXT,
            "v2" TEXT,
            "v3" TEXT,
            "v4" TEXT,
            "v5" TEXT
        );
    `);

    console.log('--- Seeding Casbin Policies ---');
    // p, sub, dom, obj, act, cols (v5)
    await db.insert(schema.casbinTable).values([
        // Admin
        { ptype: 'p', v0: 'admin', v1: 'admin', v2: '/v1/projects', v3: 'GET', v5: '*' },

        // Row Level (Project 1 Users)
        { ptype: 'p', v0: 'user', v1: '1', v2: '/v1/data/1/posts', v3: 'GET', v5: 'title,content' }, // Restricted columns
        { ptype: 'p', v0: 'user', v1: '1', v2: '/v1/data/1/posts/123', v3: 'GET', v5: '*' }, // Specific post full access

        // Row Level (Project 2 Users)
        { ptype: 'p', v0: 'user', v1: '2', v2: '/v1/data/2/posts', v3: 'GET', v5: '*' },
    ]);

    const modelPath = path.resolve(__dirname, 'src/lib/rbac_model.conf');
    const adapter = await DrizzleAdapter.newAdapter(db as any, schema.casbinTable as any);
    const enforcer = await newEnforcer(modelPath, adapter);
    await enforcer.loadPolicy();

    const tests = [
        { sub: 'admin', dom: 'admin', obj: '/v1/projects', act: 'GET', expected: true },
        // Row Level
        { sub: 'user', dom: '1', obj: '/v1/data/1/posts', act: 'GET', expected: true },
        { sub: 'user', dom: '1', obj: '/v1/data/1/posts/123', act: 'GET', expected: true },
        { sub: 'user', dom: '1', obj: '/v1/data/1/posts/999', act: 'GET', expected: false }, // Not explicitly allowed (default matchers typically require explicit)
        // Wait, standard matchers with keyMatch usually require wildcard to allow sub-paths.
        // If my policy is EXACT '/v1/data/1/posts', it won't match 'posts/999'.
        // Let's verify this behavior.
    ];

    console.log('\n--- Running Permission Tests ---');
    for (const test of tests) {
        const allowed = await enforcer.enforce(test.sub, test.dom, test.obj, test.act);
        console.log(`[${test.sub}@${test.dom}] ${test.act} ${test.obj} -> Allowed: ${allowed} (Expected: ${test.expected})`);

        // --- Column Logic Simulation ---
        if (allowed) {
            const policies = await enforcer.getFilteredPolicy(0, test.sub, test.dom);
            let allowedCols: Set<string> | null = null;
            let matched = false;

            const keyMatch = (key: string, pattern: string) => {
                if (pattern === '*') return true;
                if (pattern.endsWith('*')) return key.startsWith(pattern.slice(0, -1));
                return key === pattern;
            };

            for (const policy of policies) {
                const pObj = policy[2];
                const pAct = policy[3];
                const pCols = policy[4]; // v5

                if (keyMatch(test.obj, pObj) && (pAct === test.act || pAct === '*')) {
                    matched = true;
                    if (!pCols || pCols === '*' || pCols === '') {
                        allowedCols = null;
                        break;
                    }

                    if (allowedCols === null) allowedCols = new Set();
                    pCols.split(',').forEach(col => allowedCols!.add(col.trim()));
                }
            }

            if (matched) {
                const colStr = allowedCols ? Array.from(allowedCols).join(', ') : 'ALL';
                console.log(`   -> Allowed Columns: ${colStr}`);
            }
        }

    }

    process.exit(0);
}

testPermissions().catch(err => {
    console.error(err);
    process.exit(1);
});
