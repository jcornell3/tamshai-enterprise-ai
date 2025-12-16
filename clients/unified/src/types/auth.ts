/**
 * Authentication Types
 *
 * Shared type definitions for authentication across all platforms.
 * Article V Compliance: Token storage handled by platform-native secure storage.
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  accessTokenExpirationDate: string;
  tokenType: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  tokens: Tokens | null;
  user: User | null;
  error: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  roles: string[];
}

export interface AuthConfig {
  issuer: string;
  clientId: string;
  redirectUrl: string;
  scopes: string[];
  usePKCE: boolean;
}

export interface AuthActions {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
