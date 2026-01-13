import { newEnforcer, Enforcer } from 'casbin';
import { DrizzleAdapter } from 'casbin-drizzle-adapter';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '@/db/index.js';
import * as schema from '@/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let enforcer: Enforcer;

export async function getEnforcer() {
    if (!enforcer) {
        const modelPath = path.resolve(__dirname, 'rbac_model.conf');

        // Initialize Drizzle Adapter with our existing db instance and schema
        // Casting db to any due to internal type mismatch in casbin-drizzle-adapter
        const adapter = await DrizzleAdapter.newAdapter(db as any, schema.casbinTable as any);

        enforcer = await newEnforcer(modelPath, adapter);

        // Load the policy from DB
        await enforcer.loadPolicy();
    }
    return enforcer;
}
