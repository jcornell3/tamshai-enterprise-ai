/**
 * Test Authentication Provider - Token Exchange
 *
 * Provides secure authentication for integration tests using OAuth 2.0 token exchange
 * instead of ROPC (Resource Owner Password Credentials).
 *
 * @see .claude/plans/test-auth-refactoring.md
 * @see docs/testing/TEST_USER_JOURNEY.md#integration-test-service-account
 */

import axios, { AxiosError } from 'axios';

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Token cache entry
 */
interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/**
 * Configuration for TestAuthProvider
 */
export interface TestAuthConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Test Authentication Provider
 *
 * Manages OAuth 2.0 authentication for integration tests using:
 * 1. Client Credentials flow for service account token
 * 2. Token Exchange (RFC 8693) for user impersonation
 *
 * Features:
 * - Token caching (5-minute TTL with 30s buffer)
 * - Automatic token refresh
 * - Error handling with descriptive messages
 * - Singleton pattern for test suite efficiency
 *
 * @example
 * ```typescript
 * const authProvider = getTestAuthProvider();
 * const aliceToken = await authProvider.getUserToken('alice.chen');
 * // Use aliceToken in test requests
 * ```
 */
export class TestAuthProvider {
  private serviceToken: string | null = null;
  private serviceTokenExpiresAt: number = 0;
  private userTokenCache: Record<string, TokenCacheEntry> = {};

  constructor(
    private config: TestAuthConfig,
    private logger: Logger
  ) {}

  /**
   * Get service account token using client credentials flow
   *
   * @returns Service account access token
   * @throws Error if authentication fails
   */
  async getServiceToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 30s buffer)
    if (this.serviceToken && this.serviceTokenExpiresAt > now + 30000) {
      this.logger.debug('Using cached service token');
      return this.serviceToken;
    }

    this.logger.debug('Acquiring service account token (client credentials)');

    try {
      const response = await axios.post(
        `${this.config.keycloakUrl}/realms/${this.config.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const token = response.data.access_token;
      this.serviceToken = token;
      this.serviceTokenExpiresAt = now + (response.data.expires_in * 1000);

      this.logger.info('Service account token acquired', {
        expiresIn: response.data.expires_in,
      });

      return token;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error('Failed to acquire service token', {
        error: axiosError.message,
        response: axiosError.response?.data,
      });
      throw new Error(
        `Failed to acquire service token: ${axiosError.response?.data || axiosError.message}`
      );
    }
  }

  /**
   * Get user token via token exchange (impersonation)
   *
   * Exchanges the service account token for a user token with the user's roles and permissions.
   *
   * @param username - Username to impersonate (e.g., "alice.chen")
   * @returns User access token with user's roles
   * @throws Error if token exchange fails
   */
  async getUserToken(username: string): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 30s buffer)
    const cached = this.userTokenCache[username];
    if (cached && cached.expiresAt > now + 30000) {
      this.logger.debug(`Using cached token for ${username}`);
      return cached.token;
    }

    this.logger.debug(`Acquiring user token for ${username} (token exchange)`);

    try {
      const serviceToken = await this.getServiceToken();

      const response = await axios.post(
        `${this.config.keycloakUrl}/realms/${this.config.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: serviceToken,
          requested_subject: username,
          scope: 'openid profile roles', // Required for preferred_username and resource_access claims
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const userToken = response.data.access_token;
      this.userTokenCache[username] = {
        token: userToken,
        expiresAt: now + (response.data.expires_in * 1000),
      };

      this.logger.info(`User token acquired for ${username}`, {
        expiresIn: response.data.expires_in,
      });

      return userToken;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorData = axiosError.response?.data;
      const errorMessage = typeof errorData === 'object'
        ? JSON.stringify(errorData)
        : errorData || axiosError.message;

      this.logger.error(`Failed to acquire user token for ${username}`, {
        error: axiosError.message,
        status: axiosError.response?.status,
        response: errorData,
      });
      throw new Error(
        `Failed to acquire user token for ${username}: ${errorMessage}`
      );
    }
  }

  /**
   * Clear all cached tokens
   *
   * Use between test suites to ensure fresh tokens.
   */
  clearCache(): void {
    this.serviceToken = null;
    this.serviceTokenExpiresAt = 0;
    this.userTokenCache = {};
    this.logger.debug('Token cache cleared');
  }
}

/**
 * Singleton instance for test files
 */
let authProvider: TestAuthProvider | null = null;

/**
 * Get singleton TestAuthProvider instance
 *
 * Creates a new instance on first call, returns cached instance on subsequent calls.
 * Configuration is loaded from environment variables.
 *
 * @param logger - Optional logger (creates console logger if not provided)
 * @returns TestAuthProvider singleton instance
 *
 * @example
 * ```typescript
 * // In test file
 * import { getTestAuthProvider } from '@/tests/shared/auth/token-exchange';
 *
 * const authProvider = getTestAuthProvider();
 * const token = await authProvider.getUserToken('alice.chen');
 * ```
 */
export function getTestAuthProvider(logger?: Logger): TestAuthProvider {
  if (!authProvider) {
    // Default console logger if none provided
    const defaultLogger: Logger = {
      debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta || ''),
      info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
    };

    const config: TestAuthConfig = {
      keycloakUrl: process.env.KEYCLOAK_URL || `http://localhost:${process.env.DEV_KEYCLOAK}/auth`,
      realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
      clientId: process.env.MCP_INTEGRATION_RUNNER_CLIENT_ID || 'mcp-integration-runner',
      clientSecret: process.env.MCP_INTEGRATION_RUNNER_SECRET || '',
    };

    if (!config.clientSecret) {
      throw new Error(
        'MCP_INTEGRATION_RUNNER_SECRET environment variable is required for token exchange authentication'
      );
    }

    authProvider = new TestAuthProvider(config, logger || defaultLogger);
  }

  return authProvider;
}

/**
 * Reset the singleton instance (for testing)
 *
 * @internal
 */
export function resetTestAuthProvider(): void {
  authProvider = null;
}
