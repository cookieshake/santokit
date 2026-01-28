/**
 * Santoki Server - Edge Runtime
 * 
 * This is the main entry point for the Santoki Edge Server.
 * It provides a runtime-agnostic execution environment that can run on
 * Cloudflare Workers, Docker, AWS Lambda, or any Standard Web API compatible runtime.
 */

export { SantokiServer } from './runtime/server.ts';
export { createContext, type Context } from './context/index.ts';
export type { LogicHandler, LogicConfig, RequestInfo } from './runtime/types.ts';
