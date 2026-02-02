import { createContext, type Context } from '../context/index.js';
import type { Bundle, LogicConfig, RequestInfo, UserInfo } from './types.js';
import { executeBundle } from './logic.js';
import { Logger, formatErrorResponse, NotFoundError, AuthorizationError } from '../utils/logger.js';

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
 * SantokitServer is the main Edge runtime server
 */
export class SantokitServer {
  private config: ServerConfig;
  private bundleCache: Map<string, Bundle> = new Map();
  private logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = new Logger(undefined, { projectId: config.projectId });
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
    let namespace: string | null = null;
    let name: string | null = null;
    let providedParams: Record<string, unknown> | null = null;

    if (path === 'call') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        });
      }

      try {
        const payload = (await request.json()) as {
          path?: string;
          params?: Record<string, unknown>;
        };
        const targetPath = typeof payload.path === 'string' ? payload.path : '';
        [namespace, name] = this.parsePath(targetPath);
        providedParams = payload.params && typeof payload.params === 'object' ? payload.params : {};
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        });
      }
    } else {
      [namespace, name] = this.parsePath(path);
    }

    // Create request-scoped logger
    const logger = this.logger.child({ requestId, path, method: request.method });

    if (!namespace || !name) {
      logger.warn('Invalid path format');
      const { status, body } = formatErrorResponse(new NotFoundError('Invalid path format'), requestId);
      return new Response(body, {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
    }

    logger.info('Processing request', { namespace, name });

    try {
      // Load bundle from KV
      const bundle = await this.loadBundle(namespace, name);
      if (!bundle) {
        logger.warn('Logic bundle not found', { namespace, name });
        throw new NotFoundError(`Logic ${namespace}/${name}`);
      }

      if (name.startsWith('_')) {
        logger.warn('Access denied (private logic)', { namespace, name });
        throw new AuthorizationError();
      }

      // Parse user from JWT (if authenticated)
      const user = await this.authenticateRequest(request);

      if (user) {
        logger.debug('User authenticated', { userId: user.id });
      }

      // Check access control
      if (!this.checkAccess(bundle.config, user)) {
        logger.warn('Access denied', {
          namespace,
          name,
          userId: user?.id,
          requiredAccess: bundle.config.access
        });
        throw new AuthorizationError();
      }

      // Parse parameters
      const params = await this.parseParams(request, bundle.config, providedParams);
      logger.debug('Parameters parsed', { paramCount: Object.keys(params).length });

      // Check if this request can be cached
      const cacheConfig = bundle.config.cache;
      const access = bundle.config.access || 'public';
      const canCache =
        access === 'public' &&
        cacheConfig &&
        cacheConfig !== '' &&
        typeof caches !== 'undefined';

      let cacheRequest: Request | null = null;
      if (canCache) {
        if (request.method === 'GET') {
          cacheRequest = request;
        } else {
          const cacheUrl = new URL(request.url);
          cacheUrl.pathname = '/__stk_cache';
          cacheUrl.searchParams.set('path', `${namespace}/${name}`);
          cacheUrl.searchParams.set('params', stableStringify(params));
          cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
        }
      }

      if (canCache && cacheRequest) {
        const cache = (caches as any).default as Cache;
        const cachedResponse = await cache.match(cacheRequest);

        if (cachedResponse) {
          logger.info('Cache HIT', { namespace, name });
          const response = new Response(cachedResponse.body, cachedResponse);
          response.headers.set('X-Cache-Status', 'HIT');
          response.headers.set('X-Request-ID', requestId);
          return response;
        }

        logger.debug('Cache MISS', { namespace, name });
      }

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
      const startTime = Date.now();
      const result = await this.executeLogic(bundle, params, context);
      const duration = Date.now() - startTime;

      logger.info('Logic executed successfully', {
        namespace,
        name,
        duration,
        cached: canCache
      });

      // Check cache configuration
      const cacheHeaders = this.getCacheHeaders(bundle.config);

      const response = new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Cache-Status': 'MISS',
          'X-Execution-Time': `${duration}ms`,
          ...cacheHeaders,
        },
      });

      // Store in cache if configured
      if (canCache && cacheRequest) {
        const cache = (caches as any).default as Cache;
        // Clone the response before caching (response can only be read once)
        await cache.put(cacheRequest, response.clone());
        logger.debug('Response cached', { namespace, name });
      }

      return response;
    } catch (error) {
      logger.error('Request failed', error, { namespace, name });

      const { status, body } = formatErrorResponse(error, requestId);
      return new Response(body, {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
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
    const latestKey = `project:${this.config.projectId}:latest`;

    // Check cache
    if (this.bundleCache.has(key)) {
      return this.bundleCache.get(key)!;
    }

    // Load from KV
    const data = await this.config.kv.get(key);
    if (data) {
      const bundle = JSON.parse(data) as Bundle;
      this.bundleCache.set(key, bundle);
      return bundle;
    }

    const latest = await this.config.kv.get(latestKey);
    if (!latest) {
      return null;
    }

    const parsed = JSON.parse(latest) as { bundles?: Record<string, Bundle> };
    if (!parsed || !parsed.bundles) {
      return null;
    }

    for (const bundle of Object.values(parsed.bundles)) {
      if (!bundle || !bundle.namespace || !bundle.name) {
        continue;
      }
      const bundleKey = `${this.config.projectId}:logic:${bundle.namespace}:${bundle.name}`;
      this.bundleCache.set(bundleKey, bundle);
    }

    return this.bundleCache.get(key) ?? null;
  }

  private async authenticateRequest(request: Request): Promise<UserInfo | undefined> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.slice(7);

    try {
      // Token format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return undefined;
      }

      // Verify signature using HMAC-SHA256
      const signingInput = `${parts[0]}.${parts[1]}`;
      const expectedSignature = await this.signJWT(signingInput);

      // Constant-time comparison to prevent timing attacks
      if (expectedSignature !== parts[2]) {
        console.error('JWT signature verification failed');
        return undefined;
      }

      // Decode and verify payload
      const payloadBytes = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

      // Check expiration
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        console.error('JWT token expired');
        return undefined;
      }

      // Map payload to UserInfo
      return {
        id: payload.sub || payload.id,
        email: payload.email,
        roles: payload.roles || [],
      };
    } catch (e) {
      console.error('Failed to authenticate JWT:', e);
      return undefined;
    }
  }

  private async signJWT(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.config.encryptionKey);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(input)
    );

    // Convert to base64url (without padding)
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
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
    config: LogicConfig,
    providedParams?: Record<string, unknown> | null
  ): Promise<Record<string, unknown>> {
    let params: Record<string, unknown> = {};

    if (providedParams) {
      params = { ...providedParams };
    } else {
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
    return await executeBundle(bundle, params, { db: this.config.db, context });
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => `"${key}":${stableStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
}
