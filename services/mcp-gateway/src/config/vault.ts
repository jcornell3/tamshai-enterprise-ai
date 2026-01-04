/**
 * Vault Client for Secret Management
 *
 * Provides optional Vault integration for reading secrets.
 * Falls back to environment variables if Vault is not configured.
 *
 * Configuration:
 *   VAULT_ADDR - Vault server address (e.g., http://vault:8200)
 *   VAULT_TOKEN - Dev mode token (for local development only)
 *   VAULT_ROLE_ID - AppRole role ID (for production)
 *   VAULT_SECRET_ID - AppRole secret ID (for production)
 *
 * Usage:
 *   const vault = await VaultClient.create();
 *   const apiKey = await vault.getSecret('mcp-gateway', 'claude_api_key');
 */

import { logger } from '../utils/logger';

interface VaultConfig {
  address: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  mountPath: string;
}

interface VaultSecretResponse {
  data: {
    data: Record<string, string>;
    metadata: {
      created_time: string;
      version: number;
    };
  };
}

interface VaultLoginResponse {
  auth: {
    client_token: string;
    lease_duration: number;
    renewable: boolean;
  };
}

export class VaultClient {
  private config: VaultConfig;
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private secretCache: Map<string, { value: string; expiry: number }> =
    new Map();
  private readonly cacheTTL = 300000; // 5 minutes

  private constructor(config: VaultConfig) {
    this.config = config;
    this.token = config.token || null;
  }

  /**
   * Create a VaultClient instance.
   * Returns null if Vault is not configured.
   */
  static async create(): Promise<VaultClient | null> {
    const address = process.env.VAULT_ADDR;

    if (!address) {
      logger.debug('Vault not configured (VAULT_ADDR not set)');
      return null;
    }

    const config: VaultConfig = {
      address,
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      mountPath: process.env.VAULT_MOUNT_PATH || 'tamshai',
    };

    const client = new VaultClient(config);

    // If we have a dev token, use it directly
    if (config.token) {
      logger.info('Vault configured with dev token');
      return client;
    }

    // Otherwise, authenticate with AppRole
    if (config.roleId && config.secretId) {
      try {
        await client.authenticate();
        logger.info('Vault authenticated via AppRole');
        return client;
      } catch (error) {
        logger.error('Vault AppRole authentication failed', { error });
        return null;
      }
    }

    logger.warn(
      'Vault address configured but no authentication method available'
    );
    return null;
  }

  /**
   * Authenticate with Vault using AppRole.
   */
  private async authenticate(): Promise<void> {
    const response = await fetch(
      `${this.config.address}/v1/auth/approle/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: this.config.roleId,
          secret_id: this.config.secretId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Vault login failed: ${response.status}`);
    }

    const data = (await response.json()) as VaultLoginResponse;
    this.token = data.auth.client_token;
    this.tokenExpiry = Date.now() + data.auth.lease_duration * 1000;

    logger.debug('Vault token obtained', {
      renewable: data.auth.renewable,
      leaseDuration: data.auth.lease_duration,
    });
  }

  /**
   * Ensure we have a valid token, re-authenticating if necessary.
   */
  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry - 60000) {
      return this.token;
    }

    // Re-authenticate if token is expired or expiring soon
    if (this.config.roleId && this.config.secretId) {
      await this.authenticate();
    }

    if (!this.token) {
      throw new Error('No valid Vault token available');
    }

    return this.token;
  }

  /**
   * Get a secret from Vault.
   *
   * @param path - Secret path (e.g., 'mcp-gateway')
   * @param key - Secret key (e.g., 'claude_api_key')
   * @returns The secret value, or null if not found
   */
  async getSecret(path: string, key: string): Promise<string | null> {
    const cacheKey = `${path}/${key}`;

    // Check cache first
    const cached = this.secretCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    try {
      const token = await this.ensureToken();
      const url = `${this.config.address}/v1/${this.config.mountPath}/data/${path}`;

      const response = await fetch(url, {
        headers: { 'X-Vault-Token': token },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn(`Vault secret not found: ${path}`);
          return null;
        }
        throw new Error(`Vault read failed: ${response.status}`);
      }

      const data = (await response.json()) as VaultSecretResponse;
      const value = data.data.data[key];

      if (value === undefined) {
        logger.warn(`Vault key not found: ${path}/${key}`);
        return null;
      }

      // Cache the result
      this.secretCache.set(cacheKey, {
        value,
        expiry: Date.now() + this.cacheTTL,
      });

      return value;
    } catch (error) {
      logger.error(`Failed to read Vault secret: ${path}/${key}`, { error });
      return null;
    }
  }

  /**
   * Get all secrets at a path.
   *
   * @param path - Secret path (e.g., 'mcp-gateway')
   * @returns Object with all key-value pairs, or null if not found
   */
  async getSecrets(path: string): Promise<Record<string, string> | null> {
    try {
      const token = await this.ensureToken();
      const url = `${this.config.address}/v1/${this.config.mountPath}/data/${path}`;

      const response = await fetch(url, {
        headers: { 'X-Vault-Token': token },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Vault read failed: ${response.status}`);
      }

      const data = (await response.json()) as VaultSecretResponse;
      return data.data.data;
    } catch (error) {
      logger.error(`Failed to read Vault secrets: ${path}`, { error });
      return null;
    }
  }

  /**
   * Check if Vault is healthy and accessible.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.address}/v1/sys/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Clear the secret cache.
   */
  clearCache(): void {
    this.secretCache.clear();
  }
}

/**
 * Get a secret, trying Vault first, then falling back to environment variable.
 *
 * @param vaultClient - VaultClient instance (or null)
 * @param vaultPath - Path in Vault (e.g., 'mcp-gateway')
 * @param vaultKey - Key in Vault (e.g., 'claude_api_key')
 * @param envVar - Environment variable name (e.g., 'CLAUDE_API_KEY')
 * @param defaultValue - Default value if neither source has the secret
 */
export async function getSecretWithFallback(
  vaultClient: VaultClient | null,
  vaultPath: string,
  vaultKey: string,
  envVar: string,
  defaultValue?: string
): Promise<string | undefined> {
  // Try Vault first
  if (vaultClient) {
    const vaultValue = await vaultClient.getSecret(vaultPath, vaultKey);
    if (vaultValue) {
      logger.debug(`Secret loaded from Vault: ${vaultPath}/${vaultKey}`);
      return vaultValue;
    }
  }

  // Fall back to environment variable
  const envValue = process.env[envVar];
  if (envValue) {
    logger.debug(`Secret loaded from environment: ${envVar}`);
    return envValue;
  }

  // Return default
  if (defaultValue !== undefined) {
    logger.debug(`Secret using default: ${envVar}`);
    return defaultValue;
  }

  logger.warn(`Secret not found: ${vaultPath}/${vaultKey} or ${envVar}`);
  return undefined;
}
