import { createContext, type Context } from '../context/index.ts';
import type { Bundle, LogicConfig, RequestInfo, UserInfo } from './types.ts';

/**
 * KVStore interface for Edge KV operations
 */
export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/**
 * DatabasePool interface for database connections
 */
export interface DatabasePool {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/**
 * ServerConfig holds server configuration
 */
export interface ServerConfig {
  projectId: string;
  kv: KVStore;
  db: Record<string, DatabasePool>; // alias -> pool
  encryptionKey: string;
}

/**
 * SantokiServer is the main Edge runtime server
 */
export class SantokiServer {
  private config: ServerConfig;
  private bundleCache: Map<string, Bundle> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Handle an incoming request (Standard Web API Request/Response)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');
    
    // Health check
    if (path === 'health') {
      return new Response('OK', { status: 200 });
    }

    // Parse request
    const requestId = crypto.randomUUID();
    const [namespace, name] = this.parsePath(path);
    
    if (!namespace || !name) {
      return this.errorResponse(404, 'Not found', requestId);
    }

    try {
      // Load bundle from KV
      const bundle = await this.loadBundle(namespace, name);
      if (!bundle) {
        return this.errorResponse(404, 'Logic not found', requestId);
      }

      // Parse user from JWT (if authenticated)
      const user = await this.authenticateRequest(request);

      // Check access control
      if (!this.checkAccess(bundle.config, user)) {
        return this.errorResponse(403, 'Forbidden', requestId);
      }

      // Parse parameters
      const params = await this.parseParams(request, bundle.config);

      // Create context
      const requestInfo: RequestInfo = {
        method: request.method,
        path: `${namespace}/${name}`,
        headers: request.headers,
        user,
        requestId,
      };
      
      const context = createContext({
        db: this.config.db,
        kv: this.config.kv,
        projectId: this.config.projectId,
        request: requestInfo,
      });

      // Execute logic
      const result = await this.executeLogic(bundle, params, context);

      // Check cache configuration
      const cacheHeaders = this.getCacheHeaders(bundle.config);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          ...cacheHeaders,
        },
      });
    } catch (error) {
      console.error(`Error executing ${namespace}/${name}:`, error);
      return this.errorResponse(500, 'Internal server error', requestId);
    }
  }

  private parsePath(path: string): [string | null, string | null] {
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) {
      return [null, null];
    }
    const name = parts.pop()!;
    const namespace = parts.join('/');
    return [namespace, name];
  }

  private async loadBundle(namespace: string, name: string): Promise<Bundle | null> {
    const key = `${this.config.projectId}:logic:${namespace}:${name}`;
    
    // Check cache
    if (this.bundleCache.has(key)) {
      return this.bundleCache.get(key)!;
    }

    // Load from KV
    const data = await this.config.kv.get(key);
    if (!data) {
      return null;
    }

    // Decrypt and parse bundle
    const bundle = JSON.parse(data) as Bundle;
    this.bundleCache.set(key, bundle);
    
    return bundle;
  }

  private async authenticateRequest(request: Request): Promise<UserInfo | undefined> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.slice(7);
    
    try {
      // Decode JWT payload (without signature verification for now)
      // Token format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return undefined;
      }
      
      const payload = JSON.parse(atob(parts[1]));
      
      // Map payload to UserInfo
      // Assuming standard claims: sub (id), email, roles
      return {
        id: payload.sub || payload.id,
        email: payload.email,
        roles: payload.roles || [],
      };
    } catch (e) {
      console.error('Failed to parse JWT:', e);
      return undefined;
    }
  }

  private checkAccess(config: LogicConfig, user?: UserInfo): boolean {
    const access = config.access || 'public';
    
    if (access === 'public') {
      return true;
    }
    
    if (!user) {
      return false;
    }
    
    if (access === 'authenticated') {
      return true;
    }
    
    // Check role
    return user.roles.includes(access);
  }

  private async parseParams(
    request: Request,
    config: LogicConfig
  ): Promise<Record<string, unknown>> {
    let params: Record<string, unknown> = {};

    // Parse query params
    const url = new URL(request.url);
    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    // Parse body for POST/PUT
    if (request.method === 'POST' || request.method === 'PUT') {
      try {
        const body = await request.json();
        params = { ...params, ...body };
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Validate and apply defaults
    if (config.params) {
      for (const [name, paramConfig] of Object.entries(config.params)) {
        if (params[name] === undefined) {
          if (paramConfig.required) {
            throw new Error(`Missing required parameter: ${name}`);
          }
          if (paramConfig.default !== undefined) {
            params[name] = paramConfig.default;
          }
        }
      }
    }

    return params;
  }

  private async executeLogic(
    bundle: Bundle,
    params: Record<string, unknown>,
    context: Context
  ): Promise<unknown> {
    if (bundle.type === 'sql') {
      // Execute SQL query
      const target = bundle.config.target || 'main';
      const db = this.config.db[target];
      if (!db) {
        throw new Error(`Database "${target}" not configured`);
      }
      
      // Replace parameter placeholders in SQL
      const { sql, values } = this.prepareSql(bundle.content, params);
      return await db.query(sql, values);
    }

    if (bundle.type === 'js') {
      // Execute JS handler
      // Note: In production, this would use isolated VM execution
      const handler = bundle.config.handler;
      if (!handler) {
        throw new Error('JS handler not found');
      }
      return await handler(params, context);
    }

    throw new Error(`Unknown bundle type: ${bundle.type}`);
  }

  private prepareSql(
    template: string,
    params: Record<string, unknown>
  ): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    let paramIndex = 0;
    
    // Replace :param_name with $1, $2, etc.
    const sql = template.replace(/:(\w+)/g, (_, name) => {
      paramIndex++;
      values.push(params[name]);
      return `$${paramIndex}`;
    });
    
    return { sql, values };
  }

  private getCacheHeaders(config: LogicConfig): Record<string, string> {
    if (!config.cache) {
      return { 'Cache-Control': 'no-store' };
    }

    // Parse duration (e.g., "5m", "1h", "1d")
    const match = config.cache.match(/^(\d+)([smhd])$/);
    if (!match) {
      return { 'Cache-Control': 'no-store' };
    }

    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    
    const seconds = value * multipliers[unit];
    
    return {
      'Cache-Control': `public, max-age=${seconds}`,
    };
  }

  private errorResponse(status: number, message: string, requestId: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
    });
  }
}
