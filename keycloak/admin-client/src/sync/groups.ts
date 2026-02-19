import type { KeycloakAdminWrapper } from '../client.js';
import type { Environment } from '../config.js';
import { logger } from '../utils/logger.js';

interface GroupConfig {
  name: string;
  realmRoles: string[];
}

export class GroupSync {
  constructor(
    private kc: KeycloakAdminWrapper,
    private environment: Environment
  ) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing Keycloak groups...');

    // Core groups
    await this.syncGroup({
      name: 'C-Suite',
      realmRoles: ['executive'],
    });

    await this.syncGroup({
      name: 'All-Employees',
      realmRoles: ['user'],
    });

    await this.syncGroup({
      name: 'HR-Team',
      realmRoles: ['hr-read', 'hr-write'],
    });

    await this.syncGroup({
      name: 'Finance-Team',
      realmRoles: ['finance-read', 'finance-write'],
    });

    await this.syncGroup({
      name: 'Sales-Team',
      realmRoles: ['sales-read', 'sales-write'],
    });

    await this.syncGroup({
      name: 'Support-Team',
      realmRoles: ['support-read', 'support-write'],
    });

    await this.syncGroup({
      name: 'Payroll-Team',
      realmRoles: ['payroll-read', 'payroll-write'],
    });

    // Assign critical users to groups
    await this.assignCriticalUsers();

    logger.info('Group sync complete');
  }

  private async syncGroup(config: GroupConfig): Promise<void> {
    const { name, realmRoles } = config;
    logger.info(`Syncing group: ${name}`);

    try {
      // Check if group exists
      const existing = await this.kc.groups.find({ search: name });
      const exactMatch = existing.find((g) => g.name === name);

      let groupId: string;

      if (exactMatch) {
        groupId = exactMatch.id!;
        logger.info(`  Group exists: ${name}`);
      } else {
        // Create group
        const created = await this.kc.groups.create({ name });
        groupId = created.id;
        logger.info(`  Created group: ${name}`);
      }

      // Assign realm roles to group
      for (const roleName of realmRoles) {
        try {
          const role = await this.kc.roles.findOneByName({ name: roleName });
          if (role) {
            await this.kc.groups.addRealmRoleMappings({
              id: groupId,
              roles: [{ id: role.id!, name: role.name! }],
            });
            logger.info(`  Assigned role '${roleName}' to group '${name}'`);
          } else {
            logger.warn(`  Role '${roleName}' not found, skipping`);
          }
        } catch (error) {
          // Role mapping may already exist, which is fine
          logger.debug(`  Role '${roleName}' mapping may already exist`);
        }
      }
    } catch (error) {
      logger.error(`Failed to sync group ${name}`, { error });
      throw error;
    }
  }

  private async assignCriticalUsers(): Promise<void> {
    logger.info('Assigning critical users to groups...');

    // E2 fix: test-user.journey ONLY gets All-Employees (NOT C-Suite)
    // This is a security fix - test user should not have executive privileges in prod
    const criticalUsers: Array<{ username: string; groupName: string }> = [
      // Executives
      { username: 'eve.thompson', groupName: 'C-Suite' },
      { username: 'michael.roberts', groupName: 'C-Suite' },
      { username: 'sarah.kim', groupName: 'C-Suite' },
      { username: 'james.wilson', groupName: 'C-Suite' },

      // All users get All-Employees
      { username: 'eve.thompson', groupName: 'All-Employees' },
      { username: 'alice.chen', groupName: 'All-Employees' },
      { username: 'bob.martinez', groupName: 'All-Employees' },
      { username: 'carol.johnson', groupName: 'All-Employees' },
      { username: 'dan.williams', groupName: 'All-Employees' },
      { username: 'nina.patel', groupName: 'All-Employees' },
      { username: 'marcus.johnson', groupName: 'All-Employees' },
      { username: 'frank.davis', groupName: 'All-Employees' },

      // Test user - E2 security fix: NO C-Suite membership
      { username: 'test-user.journey', groupName: 'All-Employees' },
      // NOTE: Intentionally NOT adding test-user.journey to C-Suite

      // Department teams
      { username: 'alice.chen', groupName: 'HR-Team' },
      { username: 'bob.martinez', groupName: 'Finance-Team' },
      { username: 'carol.johnson', groupName: 'Sales-Team' },
      { username: 'dan.williams', groupName: 'Support-Team' },
    ];

    for (const { username, groupName } of criticalUsers) {
      await this.assignUserToGroup(username, groupName);
    }
  }

  private async assignUserToGroup(
    username: string,
    groupName: string
  ): Promise<void> {
    try {
      const users = await this.kc.users.find({ username, exact: true });
      if (users.length === 0) {
        logger.debug(`  User '${username}' not found, skipping group assignment`);
        return;
      }

      const groups = await this.kc.groups.find({ search: groupName });
      const group = groups.find((g) => g.name === groupName);
      if (!group) {
        logger.warn(`  Group '${groupName}' not found`);
        return;
      }

      await this.kc.users.addToGroup({
        id: users[0].id!,
        groupId: group.id!,
      });

      logger.info(`  Assigned '${username}' to '${groupName}'`);
    } catch (error) {
      // User may already be in group, which is fine
      logger.debug(`  Could not assign '${username}' to '${groupName}' (may already exist)`);
    }
  }
}
