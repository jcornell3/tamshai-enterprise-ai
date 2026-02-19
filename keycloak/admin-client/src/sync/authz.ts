import type { KeycloakAdminWrapper } from '../client.js';
import { logger } from '../utils/logger.js';

/**
 * Authorization sync for token exchange configuration.
 * Token exchange is used by integration tests to impersonate users
 * without needing their passwords.
 */
export class AuthzSync {
  constructor(private kc: KeycloakAdminWrapper) {}

  async syncTokenExchange(): Promise<void> {
    logger.info('Syncing token exchange permissions...');

    try {
      // Find mcp-integration-runner client
      const clients = await this.kc.clients.find({ clientId: 'mcp-integration-runner' });
      if (clients.length === 0) {
        logger.warn('  mcp-integration-runner client not found, skipping token exchange setup');
        return;
      }

      const runnerClient = clients[0];
      const runnerClientId = runnerClient.id!;

      // Get service account user for the client
      const serviceAccountUser = await this.kc.clients.getServiceAccountUser({
        id: runnerClientId,
      });

      if (!serviceAccountUser) {
        logger.warn('  Service account user not found for mcp-integration-runner');
        return;
      }

      // Find the realm-management client (for token-exchange role)
      const realmMgmtClients = await this.kc.clients.find({ clientId: 'realm-management' });
      if (realmMgmtClients.length === 0) {
        logger.warn('  realm-management client not found');
        return;
      }

      const realmMgmtClient = realmMgmtClients[0];
      const realmMgmtClientId = realmMgmtClient.id!;

      // Get available client roles
      const availableRoles = await this.kc.users.listAvailableClientRoleMappings({
        id: serviceAccountUser.id!,
        clientUniqueId: realmMgmtClientId,
      });

      // Find the token-exchange role (if it exists)
      // Note: This role needs to be created manually or via realm import
      const tokenExchangeRole = availableRoles.find(
        (r) => r.name === 'token-exchange' || r.name === 'impersonation'
      );

      if (tokenExchangeRole && tokenExchangeRole.id && tokenExchangeRole.name) {
        // Assign the role
        await this.kc.users.addClientRoleMappings({
          id: serviceAccountUser.id!,
          clientUniqueId: realmMgmtClientId,
          roles: [{ id: tokenExchangeRole.id, name: tokenExchangeRole.name }],
        });
        logger.info(`  Assigned '${tokenExchangeRole.name}' role to mcp-integration-runner`);
      } else {
        logger.info('  Token exchange role not found in available roles');
        logger.info('  Available roles:', availableRoles.map((r) => r.name).join(', '));
      }

      // Configure token exchange permissions via authorization services
      // This is typically done via realm import, but we can enable it programmatically

      logger.info('Token exchange sync complete');
    } catch (error) {
      logger.error('Failed to sync token exchange permissions', { error });
      // Don't throw - token exchange is optional for dev environments
    }
  }
}
