/**
 * @santoki/client - Type-safe Santoki Client SDK
 * 
 * This SDK provides a proxy-based interface for calling Santoki logic endpoints
 * with full TypeScript IntelliSense support via module augmentation.
 * 
 * @example
 * ```typescript
 * import { createClient } from '@santoki/client';
 * 
 * const stk = createClient({ baseUrl: 'https://api.myapp.com' });
 * 
 * // Type-safe calls with IntelliSense
 * const user = await stk.logic.users.get({ id: '123' });
 * const orders = await stk.logic.orders.list({ userId: '123' });
 * ```
 */

export { createClient, type SantokiClient } from './proxy/client.js';
export { type AuthModule, type User, type Session } from './auth/types.js';
export { type ClientConfig, type RequestOptions } from './types/config.js';

// Module augmentation interface for type generation
// Users will have santoki-env.d.ts that augments this
declare module '@santoki/client' {
  interface LogicNamespace {
    // This will be augmented by santoki-env.d.ts
    // Example:
    // users: {
    //   get: (params: { id: string }) => Promise<User>;
    //   list: (params: { limit?: number }) => Promise<User[]>;
    // };
  }
}
