import type { KeycloakAdminWrapper } from '../client.js';
import { logger } from '../utils/logger.js';

export class ScopeSync {
  constructor(private kc: KeycloakAdminWrapper) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing client scopes...');

    // Ensure 'roles' scope exists
    await this.ensureRolesScope();

    logger.info('Client scope sync complete');
  }

  private async ensureRolesScope(): Promise<void> {
    const scopeName = 'roles';
    logger.info(`Checking scope: ${scopeName}`);

    const existing = await this.kc.clientScopes.find();
    const rolesScope = existing.find((s) => s.name === scopeName);

    if (rolesScope) {
      logger.info(`  Scope '${scopeName}' already exists`);
      return;
    }

    // Create roles scope
    await this.kc.clientScopes.create({
      name: scopeName,
      description: 'OpenID Connect roles scope',
      protocol: 'openid-connect',
      attributes: {
        'include.in.token.scope': 'true',
        'display.on.consent.screen': 'true',
      },
    });

    logger.info(`  Created scope: ${scopeName}`);
  }
}
