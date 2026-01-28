/**
 * Authenticated user information
 */
export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  roles: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Authentication session
 */
export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * OAuth provider names
 */
export type OAuthProvider = 'google' | 'github' | 'apple' | 'microsoft';

/**
 * Authentication module interface
 */
export interface AuthModule {
  /**
   * Login with email and password
   */
  login(credentials: LoginCredentials): Promise<Session>;

  /**
   * Login with OAuth provider
   */
  loginWithOAuth(provider: OAuthProvider, options?: OAuthOptions): Promise<Session>;

  /**
   * Logout and clear session
   */
  logout(): Promise<void>;

  /**
   * Get current authenticated user
   */
  me(): Promise<User | null>;

  /**
   * Get current access token
   */
  getToken(): Promise<string | null>;

  /**
   * Refresh the access token
   */
  refreshToken(): Promise<Session>;

  /**
   * Register a new user
   */
  register(data: RegisterData): Promise<Session>;

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): Promise<boolean>;
}

/**
 * OAuth options
 */
export interface OAuthOptions {
  /** Redirect URL after OAuth flow */
  redirectUrl?: string;
  
  /** OAuth scopes to request */
  scopes?: string[];
  
  /** State parameter for CSRF protection */
  state?: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
