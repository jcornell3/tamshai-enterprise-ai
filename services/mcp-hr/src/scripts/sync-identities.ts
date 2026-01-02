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
import { IdentityService, BulkSyncResult, CleanupQueue } from '../services/identity';

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
    log('info', 'Authenticating with Keycloak...');
    await kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: config.keycloak.clientId,
      clientSecret: config.keycloak.clientSecret,
    });
    log('info', 'Keycloak authentication successful');

    // Create IdentityService
    const identityService = new IdentityService(pool, kcAdmin, cleanupQueue);

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
