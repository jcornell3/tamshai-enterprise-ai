import { program } from 'commander';
import { loadConfig } from './config.js';
import { KeycloakAdminWrapper } from './client.js';
import { ScopeSync } from './sync/scopes.js';
import { ClientSync } from './sync/clients.js';
import { MapperSync } from './sync/mappers.js';
import { GroupSync } from './sync/groups.js';
import { UserSync } from './sync/users.js';
import { AuthzSync } from './sync/authz.js';
import { logger } from './utils/logger.js';

async function runSync(): Promise<void> {
  const { keycloak, secrets } = loadConfig();

  logger.info('==========================================');
  logger.info('Keycloak Realm Sync - Starting');
  logger.info(`Environment: ${keycloak.environment}`);
  logger.info(`Keycloak URL: ${keycloak.baseUrl}`);
  logger.info(`Realm: ${keycloak.realmName}`);
  logger.info('==========================================');

  // Initialize client and authenticate
  const kc = new KeycloakAdminWrapper(keycloak);
  await kc.authenticate();
  await kc.setRealm(keycloak.realmName);

  // Sync operations (order matters!)
  // 1. Scopes first (clients reference scopes)
  const scopeSync = new ScopeSync(kc);
  await scopeSync.syncAll();

  // 2. Clients (depend on scopes)
  const clientSync = new ClientSync(kc, secrets, keycloak.environment);
  await clientSync.syncAll();

  // 3. Mappers (depend on clients and scopes)
  const mapperSync = new MapperSync(kc);
  await mapperSync.syncAll();

  // 4. Groups (can reference roles)
  const groupSync = new GroupSync(kc, keycloak.environment);
  await groupSync.syncAll();

  // 5. Users (can be assigned to groups)
  const userSync = new UserSync(kc, keycloak.environment);
  await userSync.syncAll();

  // 6. Token exchange permissions (dev/stage only - for integration tests)
  if (keycloak.environment === 'dev' || keycloak.environment === 'stage') {
    const authzSync = new AuthzSync(kc);
    await authzSync.syncTokenExchange();
  }

  logger.info('==========================================');
  logger.info('Keycloak Realm Sync - Complete');
  logger.info('==========================================');
}

async function listClients(): Promise<void> {
  const { keycloak } = loadConfig();
  const kc = new KeycloakAdminWrapper(keycloak);
  await kc.authenticate();
  await kc.setRealm(keycloak.realmName);

  const clients = await kc.clients.find();
  logger.info('Clients:');
  for (const client of clients) {
    logger.info(`  - ${client.clientId} (${client.name || 'no name'})`);
  }
}

async function listUsers(): Promise<void> {
  const { keycloak } = loadConfig();
  const kc = new KeycloakAdminWrapper(keycloak);
  await kc.authenticate();
  await kc.setRealm(keycloak.realmName);

  const users = await kc.users.find({ max: 100 });
  logger.info('Users:');
  for (const user of users) {
    const groups = await kc.users.listGroups({ id: user.id! });
    const groupNames = groups.map((g) => g.name).join(', ') || 'none';
    logger.info(`  - ${user.username} (groups: ${groupNames})`);
  }
}

async function listGroups(): Promise<void> {
  const { keycloak } = loadConfig();
  const kc = new KeycloakAdminWrapper(keycloak);
  await kc.authenticate();
  await kc.setRealm(keycloak.realmName);

  const groups = await kc.groups.find();
  logger.info('Groups:');
  for (const group of groups) {
    const roles = await kc.groups.listRealmRoleMappings({ id: group.id! });
    const roleNames = roles.map((r) => r.name).join(', ') || 'none';
    logger.info(`  - ${group.name} (roles: ${roleNames})`);
  }
}

// CLI setup
program
  .name('keycloak-admin')
  .description('Keycloak administration client for Tamshai Enterprise AI')
  .version('1.0.0');

program
  .command('sync')
  .description('Synchronize Keycloak realm configuration')
  .action(async () => {
    try {
      await runSync();
      process.exit(0);
    } catch (error) {
      logger.error('Sync failed', { error });
      process.exit(1);
    }
  });

program
  .command('list-clients')
  .description('List all clients in the realm')
  .action(async () => {
    try {
      await listClients();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to list clients', { error });
      process.exit(1);
    }
  });

program
  .command('list-users')
  .description('List all users in the realm')
  .action(async () => {
    try {
      await listUsers();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to list users', { error });
      process.exit(1);
    }
  });

program
  .command('list-groups')
  .description('List all groups in the realm')
  .action(async () => {
    try {
      await listGroups();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to list groups', { error });
      process.exit(1);
    }
  });

program.parse();
