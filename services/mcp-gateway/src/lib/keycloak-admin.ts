/**
 * Keycloak Admin Client
 *
 * Provides authenticated access to Keycloak Admin REST API for user/role management.
 *
 * Features:
 * - Singleton pattern for connection reuse
 * - Automatic token refresh (58s interval, token expires at 60s)
 * - Realm switching (defaults to tamshai-corp)
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger';

let kcAdminClient: KcAdminClient | null = null;
let tokenRefreshInterval: NodeJS.Timeout | null = null;

/**
 * Get Keycloak Admin Client instance (singleton)
 *
 * Authentication:
 * - Uses admin credentials from environment variables
 * - Grants access to master realm, then switches to tamshai-corp
 * - Token auto-refreshes every 58 seconds
 *
 * @returns Authenticated Keycloak Admin Client
 * @throws Error if KEYCLOAK_ADMIN_PASSWORD not set
 */
export async function getKeycloakAdminClient(): Promise<KcAdminClient> {
  if (!kcAdminClient) {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080/auth';
    const adminUser = process.env.KEYCLOAK_ADMIN || 'admin';
    const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error('KEYCLOAK_ADMIN_PASSWORD environment variable is required');
    }

    logger.info('Initializing Keycloak Admin Client', { keycloakUrl });

    kcAdminClient = new KcAdminClient({
      baseUrl: keycloakUrl,
      realmName: 'master',
    });

    // Authenticate with admin credentials
    try {
      await kcAdminClient.auth({
        username: adminUser,
        password: adminPassword,
        grantType: 'password',
        clientId: 'admin-cli',
      });

      logger.info('Keycloak Admin Client authenticated successfully');

      // Auto-refresh token every 58 seconds (token expires at 60s)
      tokenRefreshInterval = setInterval(async () => {
        try {
          await kcAdminClient!.auth({
            username: adminUser,
            password: adminPassword,
            grantType: 'password',
            clientId: 'admin-cli',
          });
          logger.debug('Keycloak admin token refreshed');
        } catch (error) {
          logger.error('Failed to refresh Keycloak admin token', { error });
        }
      }, 58 * 1000);

      logger.info('Keycloak admin token auto-refresh enabled (58s interval)');
    } catch (error) {
      logger.error('Failed to authenticate Keycloak Admin Client', { error });
      throw new Error('Keycloak Admin Client authentication failed');
    }
  }

  // Set realm to tamshai-corp for all operations
  kcAdminClient.setConfig({ realmName: 'tamshai-corp' });

  return kcAdminClient;
}

/**
 * Cleanup function (call on server shutdown)
 */
export function cleanupKeycloakAdminClient(): void {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
    logger.info('Keycloak admin token refresh interval cleared');
  }
  kcAdminClient = null;
}

/**
 * Health check for Keycloak Admin Client
 *
 * @returns True if client is authenticated and can access Keycloak
 */
export async function isKeycloakAdminHealthy(): Promise<boolean> {
  try {
    const client = await getKeycloakAdminClient();
    // Try a simple read operation
    await client.realms.findOne({ realm: 'tamshai-corp' });
    return true;
  } catch (error) {
    logger.error('Keycloak Admin Client health check failed', { error });
    return false;
  }
}
