/**
 * Keycloak Authentication Service
 *
 * Implements OAuth2 client credentials flow for service-to-service authentication.
 * MCP-UI uses this to obtain JWT tokens for calling MCP Gateway.
 *
 * Features:
 * - Token caching with automatic refresh before expiration
 * - Proactive refresh with configurable buffer time
 * - Concurrent request deduplication (single flight)
 * - Thread-safe token management
 *
 * TDD Phase: GREEN - Implementation to pass all tests
 */

import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Configuration for Keycloak authentication.
 */
export interface KeycloakAuthConfig {
  /** Keycloak server URL (e.g., 'http://keycloak:8080') */
  keycloakUrl: string;
  /** Keycloak realm name */
  realm: string;
  /** Client ID for the service account */
  clientId: string;
  /** Client secret for authentication */
  clientSecret: string;
  /** Optional: Custom token endpoint URL */
  tokenEndpoint?: string;
  /** Optional: Seconds before expiry to refresh token (default: 30) */
  expiryBufferSeconds?: number;
}

/**
 * Token response from Keycloak.
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
  scope?: string;
}

/**
 * Cached token with expiration tracking.
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

/**
 * Keycloak Authentication Service
 *
 * Provides OAuth2 client credentials flow for obtaining access tokens.
 * Tokens are cached and automatically refreshed before expiration.
 *
 * @example
 * ```typescript
 * const auth = new KeycloakAuthService({
 *   keycloakUrl: 'http://keycloak:8080',
 *   realm: 'tamshai-corp',
 *   clientId: 'mcp-ui',
 *   clientSecret: process.env.MCP_UI_CLIENT_SECRET!,
 * });
 *
 * const token = await auth.getAccessToken();
 * // Use token in Authorization header
 * ```
 */
export class KeycloakAuthService {
  private readonly config: KeycloakAuthConfig;
  private readonly tokenEndpoint: string;
  private readonly expiryBufferMs: number;

  private cachedToken: CachedToken | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(config: KeycloakAuthConfig) {
    this.config = config;
    this.tokenEndpoint =
      config.tokenEndpoint ||
      `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/token`;
    this.expiryBufferMs = (config.expiryBufferSeconds ?? 30) * 1000;
  }

  /**
   * Get an access token, fetching from Keycloak if needed.
   *
   * The token is cached and reused until it expires (minus buffer time).
   * Concurrent calls will share the same token request.
   *
   * @returns The access token string
   * @throws Error if authentication fails
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.isTokenValid()) {
      return this.cachedToken!.accessToken;
    }

    // If a token request is already in progress, wait for it
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start a new token request
    this.tokenPromise = this.fetchToken();

    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  }

  /**
   * Check if the cached token is valid (exists and not expired).
   *
   * @returns true if token is valid, false otherwise
   */
  isTokenValid(): boolean {
    if (!this.cachedToken) {
      return false;
    }

    const now = Date.now();
    const expiresAt = this.cachedToken.expiresAt - this.expiryBufferMs;

    return now < expiresAt;
  }

  /**
   * Invalidate the cached token, forcing a refresh on next getAccessToken call.
   *
   * Use this when you receive a 401 from a downstream service.
   */
  invalidateToken(): void {
    this.cachedToken = null;
    logger.info('Token invalidated');
  }

  /**
   * Fetch a new token from Keycloak using client credentials flow.
   */
  private async fetchToken(): Promise<string> {
    try {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.config.clientId);
      formData.append('client_secret', this.config.clientSecret);

      logger.debug('Fetching access token from Keycloak', {
        tokenEndpoint: this.tokenEndpoint,
        clientId: this.config.clientId,
      });

      const response = await axios.post<TokenResponse>(this.tokenEndpoint, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000, // 10 second timeout
      });

      const { access_token, expires_in } = response.data;

      // Cache the token with expiration time
      const expiresAt = Date.now() + expires_in * 1000;
      this.cachedToken = {
        accessToken: access_token,
        expiresAt,
      };

      logger.info('Successfully obtained access token from Keycloak', {
        expiresIn: expires_in,
        expiresAt: new Date(expiresAt).toISOString(),
      });

      return access_token;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to authenticate with Keycloak', {
        error: errorMessage,
        tokenEndpoint: this.tokenEndpoint,
        clientId: this.config.clientId,
      });

      throw new Error(`Failed to authenticate with Keycloak: ${errorMessage}`);
    }
  }
}

/**
 * Create a singleton instance of KeycloakAuthService from environment variables.
 *
 * Required environment variables:
 * - KEYCLOAK_URL: Keycloak server URL
 * - KEYCLOAK_REALM: Realm name (default: 'tamshai-corp')
 * - MCP_UI_CLIENT_ID: Client ID (default: 'mcp-ui')
 * - MCP_UI_CLIENT_SECRET: Client secret (required)
 *
 * @returns Configured KeycloakAuthService instance
 * @throws Error if MCP_UI_CLIENT_SECRET is not set
 */
export function createAuthServiceFromEnv(): KeycloakAuthService {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM || 'tamshai-corp';
  const clientId = process.env.MCP_UI_CLIENT_ID || 'mcp-ui';
  const clientSecret = process.env.MCP_UI_CLIENT_SECRET;

  if (!keycloakUrl) {
    throw new Error('KEYCLOAK_URL environment variable is required. Set it to your Keycloak server URL (e.g., https://keycloak.example.com/auth)');
  }

  if (!clientSecret) {
    logger.warn('MCP_UI_CLIENT_SECRET not set - service-to-service auth disabled');
    // Return a service that will throw on getAccessToken
    return new KeycloakAuthService({
      keycloakUrl,
      realm,
      clientId,
      clientSecret: '', // Empty secret will fail auth
    });
  }

  return new KeycloakAuthService({
    keycloakUrl,
    realm,
    clientId,
    clientSecret,
  });
}
