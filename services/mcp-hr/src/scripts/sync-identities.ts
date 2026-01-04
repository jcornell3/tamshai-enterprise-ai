#!/usr/bin/env tsx
/**
 * Identity Sync CLI Script
 *
 * Synchronizes all active HR employees to Keycloak.
 * This script is designed to run:
 * - Post-deployment via Docker container
 * - As part of CI/CD pipeline
 * - Manually for maintenance
 *
 * Usage:
 *   npm run sync-identities
 *   tsx src/scripts/sync-identities.ts
 *
 * Environment Variables Required:
 *   POSTGRES_HOST      - PostgreSQL host (default: localhost)
 *   POSTGRES_PORT      - PostgreSQL port (default: 5433)
 *   POSTGRES_DB        - Database name (default: tamshai_hr)
 *   POSTGRES_USER      - Database user (default: tamshai)
 *   POSTGRES_PASSWORD  - Database password
 *   KEYCLOAK_URL       - Keycloak base URL (e.g., http://keycloak:8080)
 *   KEYCLOAK_REALM     - Keycloak realm (default: tamshai-corp)
 *   KEYCLOAK_CLIENT_ID - Service account client ID (default: mcp-hr-service)
 *   KEYCLOAK_CLIENT_SECRET - Service account client secret
 *   REDIS_HOST         - Redis host for BullMQ (default: localhost)
 *   REDIS_PORT         - Redis port (default: 6379)
 *
 * Exit Codes:
 *   0 - Success (all employees synced)
 *   1 - Partial success (some errors occurred)
 *   2 - Connection failure
 *   3 - Authentication failure
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import KeycloakAdminClient from '@keycloak/keycloak-admin-client';
import { IdentityService, BulkSyncResult, CleanupQueue, KcAdminClient, KcUserRepresentation, KcRoleRepresentation, KcClientRepresentation } from '../services/identity';

/**
 * Wraps the KeycloakAdminClient to match the KcAdminClient interface.
 * This adapter handles type differences (e.g., undefined vs null).
 */
function createKcAdminClientAdapter(kcAdmin: KeycloakAdminClient): KcAdminClient {
  return {
    users: {
      create: async (user: Partial<KcUserRepresentation>): Promise<{ id: string }> => {
        return kcAdmin.users.create(user);
      },
      update: async (query: { id: string }, user: Partial<KcUserRepresentation>): Promise<void> => {
        await kcAdmin.users.update(query, user);
      },
      del: async (query: { id: string }): Promise<void> => {
        await kcAdmin.users.del(query);
      },
      find: async (query: { email?: string; username?: string }): Promise<KcUserRepresentation[]> => {
        try {
          const users = await kcAdmin.users.find(query);
          return users as KcUserRepresentation[];
        } catch (error) {
          // Enhanced error logging for debugging
          console.error('[ADAPTER] users.find() error:', {
            query,
            errorName: (error as any)?.name,
            errorMessage: (error as any)?.message,
            errorCode: (error as any)?.code,
            response: {
              status: (error as any)?.response?.status,
              statusText: (error as any)?.response?.statusText,
              data: (error as any)?.response?.data,
            },
            config: {
              url: (error as any)?.config?.url,
              method: (error as any)?.config?.method,
            },
          });
          throw error;
        }
      },
      findOne: async (query: { id: string }): Promise<KcUserRepresentation | null> => {
        const user = await kcAdmin.users.findOne(query);
        return user ?? null; // Convert undefined to null
      },
      addClientRoleMappings: async (params: {
        id: string;
        clientUniqueId: string;
        roles: KcRoleRepresentation[];
      }): Promise<void> => {
        // Cast roles to satisfy Keycloak's RoleMappingPayload type (requires id and name to be strings)
        const rolesWithIds = params.roles.filter(
          (r): r is KcRoleRepresentation & { id: string; name: string } => !!r.id && !!r.name
        );
        await kcAdmin.users.addClientRoleMappings({
          id: params.id,
          clientUniqueId: params.clientUniqueId,
          roles: rolesWithIds.map((r) => ({ id: r.id, name: r.name })),
        });
      },
      listClientRoleMappings: async (params: {
        id: string;
        clientUniqueId: string;
      }): Promise<KcRoleRepresentation[]> => {
        const roles = await kcAdmin.users.listClientRoleMappings(params);
        return roles as KcRoleRepresentation[];
      },
      listSessions: async (query: { id: string }): Promise<{ id: string }[]> => {
        const sessions = await kcAdmin.users.listSessions(query);
        return sessions.map((s: { id?: string }) => ({ id: s.id || '' }));
      },
      logout: async (query: { id: string }): Promise<void> => {
        await kcAdmin.users.logout(query);
      },
    },
    clients: {
      find: async (query: { clientId: string }): Promise<KcClientRepresentation[]> => {
        const clients = await kcAdmin.clients.find(query);
        return clients as KcClientRepresentation[];
      },
      listRoles: async (query: { id: string }): Promise<KcRoleRepresentation[]> => {
        const roles = await kcAdmin.clients.listRoles(query);
        return roles as KcRoleRepresentation[];
      },
    },
    auth: async (credentials: {
      grantType: string;
      clientId: string;
      clientSecret: string;
    }): Promise<void> => {
      await kcAdmin.auth({
        grantType: credentials.grantType as 'client_credentials',
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });
    },
  };
}

// ============================================================================
// Configuration
// ============================================================================

const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    database: process.env.POSTGRES_DB || 'tamshai_hr',
    user: process.env.POSTGRES_USER || 'tamshai',
    password: process.env.POSTGRES_PASSWORD || '',
  },
  keycloak: {
    baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8180',
    realmName: process.env.KEYCLOAK_REALM || 'tamshai-corp',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-hr-service',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
};

// ============================================================================
// Logging
// ============================================================================

function log(level: 'info' | 'error' | 'warn', message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...data };
  console.log(JSON.stringify(logEntry));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  log('info', 'Starting identity sync...', {
    keycloakUrl: config.keycloak.baseUrl,
    realm: config.keycloak.realmName,
    postgresHost: config.postgres.host,
  });

  // Create PostgreSQL connection pool
  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  // Create BullMQ queue for cleanup jobs
  const cleanupQueue = new Queue('identity-cleanup', {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
    },
  }) as CleanupQueue;

  // Create Keycloak Admin Client
  const kcAdmin = new KeycloakAdminClient({
    baseUrl: config.keycloak.baseUrl,
    realmName: config.keycloak.realmName,
  });

  try {
    // Test PostgreSQL connection
    log('info', 'Testing PostgreSQL connection...');
    await pool.query('SELECT 1');
    log('info', 'PostgreSQL connection successful');

    // Authenticate with Keycloak
    log('info', 'Authenticating with Keycloak...', {
      clientId: config.keycloak.clientId,
      hasSecret: !!config.keycloak.clientSecret,
      secretLength: config.keycloak.clientSecret?.length || 0,
    });
    await kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: config.keycloak.clientId,
      clientSecret: config.keycloak.clientSecret,
    });
    log('info', 'Keycloak authentication successful');

    // Debug: Inspect the access token to verify roles
    const accessToken = (kcAdmin as any).accessToken;
    if (accessToken) {
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          log('info', 'Access token payload:', {
            sub: payload.sub,
            azp: payload.azp,
            scope: payload.scope,
            realmAccess: payload.realm_access?.roles || [],
            resourceAccess: Object.keys(payload.resource_access || {}),
            realmManagementRoles: payload.resource_access?.['realm-management']?.roles || [],
          });
        }
      } catch (e) {
        log('warn', 'Could not decode access token for debugging', { error: String(e) });
      }
    } else {
      log('warn', 'No access token found after authentication');
    }

    // Create IdentityService with adapted Keycloak client
    const kcAdminAdapter = createKcAdminClientAdapter(kcAdmin);
    const identityService = new IdentityService(pool, kcAdminAdapter, cleanupQueue);

    // Get pending sync count
    const pendingCount = await identityService.getPendingSyncCount();
    log('info', `Found ${pendingCount} employees pending sync`);

    if (pendingCount === 0) {
      log('info', 'No employees to sync. Exiting.');
      await cleanup(pool, cleanupQueue);
      process.exit(0);
    }

    // Run bulk sync
    log('info', 'Starting bulk sync...');
    const result: BulkSyncResult = await identityService.syncAllEmployees();

    // Log results
    logSyncResults(result);

    // Cleanup and exit
    await cleanup(pool, cleanupQueue);

    if (result.success) {
      log('info', 'Identity sync completed successfully');
      process.exit(0);
    } else {
      log('warn', 'Identity sync completed with errors');
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;

    log('error', 'Identity sync failed', { error: message, stack });

    await cleanup(pool, cleanupQueue);

    // Determine exit code based on error type
    if (message.includes('connect') || message.includes('ECONNREFUSED')) {
      process.exit(2); // Connection failure
    } else if (message.includes('401') || message.includes('403') || message.includes('Unauthorized')) {
      process.exit(3); // Authentication failure
    } else {
      process.exit(1); // General failure
    }
  }
}

function logSyncResults(result: BulkSyncResult): void {
  log('info', 'Sync results', {
    totalEmployees: result.totalEmployees,
    created: result.created,
    skipped: result.skipped,
    errors: result.errors.length,
    duration: `${result.duration}ms`,
  });

  if (result.errors.length > 0) {
    log('warn', `${result.errors.length} errors occurred during sync`);
    for (const err of result.errors) {
      log('error', 'Sync error', {
        employeeId: err.employeeId,
        email: err.email,
        error: err.error,
      });
    }
  }
}

async function cleanup(pool: Pool, queue: CleanupQueue): Promise<void> {
  try {
    await pool.end();
    if ('close' in queue) {
      await (queue as unknown as { close(): Promise<void> }).close();
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Run main
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
