import KcAdminClient from '@keycloak/keycloak-admin-client';
import type { KeycloakConfig } from './config.js';
import { logger } from './utils/logger.js';
import { withRetry } from './utils/retry.js';

export class KeycloakAdminWrapper {
  private client: KcAdminClient;
  private config: KeycloakConfig;
  private authenticated = false;

  constructor(config: KeycloakConfig) {
    this.config = config;
    this.client = new KcAdminClient({
      baseUrl: config.baseUrl,
      realmName: 'master', // Auth against master realm
    });
  }

  async authenticate(): Promise<void> {
    if (this.authenticated) return;

    await withRetry(
      async () => {
        if (this.config.adminClientSecret) {
          // Prefer client credentials grant (M2 fix - no password in scripts)
          logger.info('Authenticating via client credentials grant');
          await this.client.auth({
            clientId: 'admin-cli',
            clientSecret: this.config.adminClientSecret,
            grantType: 'client_credentials',
          });
        } else if (this.config.adminPassword) {
          // Fallback to password grant
          logger.warn('Falling back to password grant (KEYCLOAK_ADMIN_CLIENT_SECRET not set)');
          await this.client.auth({
            username: this.config.adminUser,
            password: this.config.adminPassword,
            grantType: 'password',
            clientId: 'admin-cli',
          });
        } else {
          throw new Error('No authentication credentials available');
        }

        this.authenticated = true;
        logger.info('Successfully authenticated to Keycloak');
      },
      'Keycloak authentication',
      { maxAttempts: 3, delayMs: 2000 }
    );
  }

  async setRealm(realmName: string): Promise<void> {
    this.client.setConfig({ realmName });
    logger.info(`Switched to realm: ${realmName}`);
  }

  get clients() {
    return this.client.clients;
  }

  get users() {
    return this.client.users;
  }

  get groups() {
    return this.client.groups;
  }

  get roles() {
    return this.client.roles;
  }

  get clientScopes() {
    return this.client.clientScopes;
  }

  get realms() {
    return this.client.realms;
  }

  get authenticationManagement() {
    return this.client.authenticationManagement;
  }

  /**
   * Get the raw client for operations not exposed by convenience getters
   */
  get raw(): KcAdminClient {
    return this.client;
  }
}
