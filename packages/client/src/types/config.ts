/**
 * Client configuration options
 */
export interface ClientConfig {
  /** Base URL of the Santoki server */
  baseUrl: string;
  
  /** Default request timeout in milliseconds (default: 30000) */
  timeout?: number;
  
  /** Custom fetch implementation (default: global fetch) */
  fetch?: typeof fetch;
  
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  
  /** Token storage for authentication (default: localStorage in browser) */
  tokenStorage?: TokenStorage;
}

/**
 * Token storage interface
 */
export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  removeToken(): Promise<void>;
}

/**
 * Request options for individual calls
 */
export interface RequestOptions {
  /** Override timeout for this request */
  timeout?: number;
  
  /** Additional headers for this request */
  headers?: Record<string, string>;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Skip authentication for this request */
  skipAuth?: boolean;
}

/**
 * Default token storage for browser (localStorage)
 */
export class BrowserTokenStorage implements TokenStorage {
  private key = 'santoki_token';

  async getToken(): Promise<string | null> {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(this.key);
  }

  async setToken(token: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.key, token);
    }
  }

  async removeToken(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.key);
    }
  }
}

/**
 * In-memory token storage for SSR/Node.js
 */
export class MemoryTokenStorage implements TokenStorage {
  private token: string | null = null;

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
  }

  async removeToken(): Promise<void> {
    this.token = null;
  }
}
