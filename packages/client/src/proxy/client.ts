import type { ClientConfig, RequestOptions, TokenStorage } from '../types/config.js';
import { BrowserTokenStorage, MemoryTokenStorage } from '../types/config.js';
import { createAuthModule } from '../auth/auth.js';
import type { AuthModule } from '../auth/types.js';

/**
 * Santokit Client interface
 */
export interface SantokitClient {
  /** Authentication module */
  auth: AuthModule;
  
  /** Logic namespace (proxy-based, type-augmented) */
  logic: LogicProxy;
  
  /** Raw request method for custom endpoints */
  request<T>(path: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<T>;
}

/**
 * Logic proxy type - will be augmented by santokit-env.d.ts
 */
export type LogicProxy = {
  [namespace: string]: {
    [method: string]: (params?: Record<string, unknown>, options?: RequestOptions) => Promise<unknown>;
  };
};

/**
 * Create a Santokit client instance
 */
export function createClient(config: ClientConfig): SantokitClient {
  const fetchFn = config.fetch ?? globalThis.fetch;
  const timeout = config.timeout ?? 30000;
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  
  // Determine token storage
  const tokenStorage: TokenStorage = config.tokenStorage ?? 
    (typeof localStorage !== 'undefined' 
      ? new BrowserTokenStorage() 
      : new MemoryTokenStorage());

  // Create auth module
  const auth = createAuthModule(config, tokenStorage, fetchFn);

  // Create the request function
  async function request<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${baseUrl}/${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
      ...options?.headers,
    };

    // Add auth token unless skipped
    if (!options?.skipAuth) {
      const token = await tokenStorage.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout ?? timeout
    );

    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: params ? JSON.stringify(params) : undefined,
        signal: options?.signal ?? controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new SantokitError(
          error.message || `Request failed with status ${response.status}`,
          response.status,
          path
        );
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Create logic proxy
  const logic = createLogicProxy(request);

  return {
    auth,
    logic,
    request,
  };
}

/**
 * Create a proxy-based logic namespace
 * 
 * This allows `stk.logic.users.get({ id: '123' })` syntax
 * where `users` is the namespace and `get` is the method name.
 */
function createLogicProxy(
  request: <T>(path: string, params?: Record<string, unknown>, options?: RequestOptions) => Promise<T>
): LogicProxy {
  return new Proxy({} as LogicProxy, {
    get(_, namespace: string) {
      return new Proxy({}, {
        get(_, method: string) {
          return (params?: Record<string, unknown>, options?: RequestOptions) => {
            return request(`${namespace}/${method}`, params, options);
          };
        },
      });
    },
  });
}

/**
 * Santokit API error
 */
export class SantokitError extends Error {
  public statusCode: number;
  public path: string;

  constructor(
    message: string,
    statusCode: number,
    path: string
  ) {
    super(message);
    this.name = 'SantokitError';
    this.statusCode = statusCode;
    this.path = path;
  }
}
