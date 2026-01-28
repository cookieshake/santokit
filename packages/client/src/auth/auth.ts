import type {
  AuthModule,
  User,
  Session,
  LoginCredentials,
  OAuthProvider,
  OAuthOptions,
  RegisterData,
} from './types.js';
import type { ClientConfig, TokenStorage } from '../types/config.js';

/**
 * Create the authentication module
 */
export function createAuthModule(
  config: ClientConfig,
  tokenStorage: TokenStorage,
  fetchFn: typeof fetch
): AuthModule {
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${baseUrl}/auth${endpoint}`;
    const token = await tokenStorage.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetchFn(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AuthError(
        error.message || 'Authentication failed',
        response.status
      );
    }

    return response.json();
  }

  return {
    async login(credentials: LoginCredentials): Promise<Session> {
      const session = await request<Session>('/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      await tokenStorage.setToken(session.accessToken);
      return session;
    },

    async loginWithOAuth(
      provider: OAuthProvider,
      options?: OAuthOptions
    ): Promise<Session> {
      // In browser, redirect to OAuth URL
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams({
          provider,
          redirect_url: options?.redirectUrl ?? window.location.href,
          ...(options?.state && { state: options.state }),
          ...(options?.scopes && { scopes: options.scopes.join(',') }),
        });

        window.location.href = `${baseUrl}/auth/oauth?${params}`;
        
        // Return a never-resolving promise since we're redirecting
        return new Promise(() => {});
      }

      throw new AuthError('OAuth login is only available in browser', 400);
    },

    async logout(): Promise<void> {
      try {
        await request('/logout', { method: 'POST' });
      } finally {
        await tokenStorage.removeToken();
      }
    },

    async me(): Promise<User | null> {
      const token = await tokenStorage.getToken();
      if (!token) {
        return null;
      }

      try {
        return await request<User>('/me');
      } catch {
        return null;
      }
    },

    async getToken(): Promise<string | null> {
      return tokenStorage.getToken();
    },

    async refreshToken(): Promise<Session> {
      const session = await request<Session>('/refresh', {
        method: 'POST',
      });

      await tokenStorage.setToken(session.accessToken);
      return session;
    },

    async register(data: RegisterData): Promise<Session> {
      const session = await request<Session>('/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      await tokenStorage.setToken(session.accessToken);
      return session;
    },

    async isAuthenticated(): Promise<boolean> {
      const user = await this.me();
      return user !== null;
    },
  };
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  public statusCode: number;

  constructor(
    message: string,
    statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
