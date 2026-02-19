import type { KeycloakAdminWrapper } from '../client.js';
import type { Environment } from '../config.js';
import { logger } from '../utils/logger.js';

export class UserSync {
  constructor(
    private kc: KeycloakAdminWrapper,
    private environment: Environment
  ) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing user configurations...');

    // In production, we don't provision test users automatically
    // Users are created via identity-sync from HR database
    if (this.environment === 'prod') {
      logger.info('  Production mode: skipping user provisioning');
      logger.info('  Users are provisioned via identity-sync from HR database');
      return;
    }

    // Ensure test-user.journey exists (for E2E tests)
    await this.ensureTestUser();

    logger.info('User sync complete');
  }

  private async ensureTestUser(): Promise<void> {
    const username = 'test-user.journey';
    logger.info(`Ensuring test user exists: ${username}`);

    try {
      const existing = await this.kc.users.find({ username, exact: true });

      if (existing.length > 0) {
        logger.info(`  Test user '${username}' already exists`);
        return;
      }

      // Create test user
      await this.kc.users.create({
        username,
        email: 'test-user@tamshai.com',
        firstName: 'Test',
        lastName: 'User',
        enabled: true,
        emailVerified: true,
        attributes: {
          department: ['Testing'],
          employeeId: ['TEST001'],
          title: ['Journey Test Account'],
        },
      });

      logger.info(`  Created test user: ${username}`);

      // Note: Password and TOTP are set via deploy-vps.yml workflow
      // to ensure consistent credentials across environments
    } catch (error) {
      logger.error(`Failed to create test user`, { error });
      throw error;
    }
  }
}
