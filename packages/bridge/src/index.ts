/**
 * Santokit Server - Edge Runtime
 * 
 * This is the main entry point for the Santokit Edge Server.
 * It provides a runtime-agnostic execution environment that can run on
 * Cloudflare Workers, Docker, AWS Lambda, or any Standard Web API compatible runtime.
 */

export { SantokitServer } from './runtime/server.js';
export type { ServerConfig, KVStore, DatabasePool } from './runtime/server.js';
export { createContext, type Context } from './context/index.js';
export type { LogicHandler, LogicConfig, RequestInfo, Bundle, UserInfo } from './runtime/types.js';
