#!/usr/bin/env npx ts-node
/**
 * Vault Synchronization Script (H1 + H5+ Security Hardening)
 *
 * Idempotent script that ensures Vault is configured with:
 * - H1: AppRole authentication for Phoenix Vault
 * - H5+: Database secrets engine for automatic password rotation
 *
 * This script is designed to run during every Phoenix rebuild:
 * 1. After Vault is unsealed
 * 2. Before services are started
 * 3. Generates one-time-use SecretIDs with short TTL
 * 4. Configures database credential rotation (optional)
 *
 * Usage:
 *   npx ts-node scripts/vault/sync-vault.ts [options]
 *
 * Options:
 *   --generate-secret-ids  Generate ephemeral SecretIDs for services
 *   --sync-database        Explicitly enable database secrets engine
 *   --read-db-creds        Read and display current database credentials
 *
 * Environment (required):
 *   VAULT_ADDR  - Vault server address (e.g., http://localhost:8200)
 *   VAULT_TOKEN - Root/admin token with policy management permissions
 *
 * Environment (optional - H5+ database secrets engine):
 *   VAULT_POSTGRES_USER     - Vault user for PostgreSQL (e.g., vault)
 *   VAULT_POSTGRES_PASSWORD - Password for the vault PostgreSQL user
 *   POSTGRES_HOST           - PostgreSQL host (default: postgres)
 *   POSTGRES_PORT           - PostgreSQL port (default: 5432)
 *
 * Output:
 *   When --generate-secret-ids is passed, outputs JSON with generated SecretIDs
 *   These should be injected into .env before encryption to .env.enc
 */

import * as https from 'https';
import * as http from 'http';

// =============================================================================
// Configuration
// =============================================================================

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || process.env.VAULT_DEV_ROOT_TOKEN;
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || '';

// Database secrets engine configuration (H5+ enhancement)
const VAULT_POSTGRES_USER = process.env.VAULT_POSTGRES_USER;
const VAULT_POSTGRES_PASSWORD = process.env.VAULT_POSTGRES_PASSWORD;
const POSTGRES_HOST = process.env.POSTGRES_HOST || 'postgres';
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';

// AppRole configuration - Static RoleIDs (stable identifiers)
// These are hardcoded so services can be configured with them
const APPROLE_CONFIG = {
  'mcp-gateway': {
    roleId: 'mcp-gateway-role-id-tamshai-v1',
    policies: ['mcp-service'],
    tokenTtl: '1h',
    tokenMaxTtl: '4h',
    secretIdTtl: '10m',     // Short TTL for ephemeral secrets
    secretIdNumUses: 1,     // One-time use
  },
  'mcp-hr': {
    roleId: 'mcp-hr-role-id-tamshai-v1',
    policies: ['mcp-service', 'hr-service'],
    tokenTtl: '1h',
    tokenMaxTtl: '4h',
    secretIdTtl: '10m',
    secretIdNumUses: 1,
  },
  'mcp-finance': {
    roleId: 'mcp-finance-role-id-tamshai-v1',
    policies: ['mcp-service', 'finance-service'],
    tokenTtl: '1h',
    tokenMaxTtl: '4h',
    secretIdTtl: '10m',
    secretIdNumUses: 1,
  },
  'mcp-payroll': {
    roleId: 'mcp-payroll-role-id-tamshai-v1',
    policies: ['mcp-service', 'payroll-service'],
    tokenTtl: '1h',
    tokenMaxTtl: '4h',
    secretIdTtl: '10m',
    secretIdNumUses: 1,
  },
  'keycloak': {
    roleId: 'keycloak-role-id-tamshai-v1',
    policies: ['keycloak-service'],
    tokenTtl: '1h',
    tokenMaxTtl: '4h',
    secretIdTtl: '10m',
    secretIdNumUses: 1,
  },
};

// Policy definitions
const POLICIES = {
  'mcp-service': `
# MCP Service Policy - Read access to MCP secrets and databases
path "tamshai/data/mcp-gateway" {
  capabilities = ["read"]
}
path "tamshai/data/databases" {
  capabilities = ["read"]
}
`,
  'hr-service': `
# HR Service Policy - Read access to HR-specific secrets
path "tamshai/data/mcp-hr" {
  capabilities = ["read"]
}
`,
  'finance-service': `
# Finance Service Policy - Read access to finance-specific secrets
path "tamshai/data/mcp-finance" {
  capabilities = ["read"]
}
`,
  'payroll-service': `
# Payroll Service Policy - Read access to payroll-specific secrets
path "tamshai/data/mcp-payroll" {
  capabilities = ["read"]
}
`,
  'keycloak-service': `
# Keycloak Service Policy - Read access to Keycloak and database secrets
path "tamshai/data/keycloak" {
  capabilities = ["read"]
}
path "tamshai/data/databases" {
  capabilities = ["read"]
}
`,
};

// =============================================================================
// Database Secrets Engine Configuration (H5+)
// =============================================================================

const DATABASE_CONFIG = {
  databases: ['tamshai_hr', 'tamshai_finance', 'tamshai_payroll', 'tamshai_tax'],
  staticRoles: {
    'tamshai-app': {
      username: 'tamshai_app',
      rotationPeriod: '720h',  // 30 days
      rotationStatements: [
        "ALTER USER \"{{name}}\" WITH PASSWORD '{{password}}' NOBYPASSRLS;"
      ]
    }
  }
};

// =============================================================================
// Vault HTTP Client
// =============================================================================

interface VaultResponse<T = unknown> {
  data?: T;
  errors?: string[];
  warnings?: string[];
}

async function vaultRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<VaultResponse<T>> {
  const url = new URL(path, VAULT_ADDR);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const options: http.RequestOptions = {
    method,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    headers: {
      'X-Vault-Token': VAULT_TOKEN,
      'Content-Type': 'application/json',
      ...(VAULT_NAMESPACE ? { 'X-Vault-Namespace': VAULT_NAMESPACE } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 204) {
          resolve({});
          return;
        }
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Vault error (${res.statusCode}): ${JSON.stringify(json.errors || json)}`));
          } else {
            resolve(json);
          }
        } catch {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Vault error (${res.statusCode}): ${data}`));
          } else {
            resolve({ data: data as unknown as T });
          }
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// =============================================================================
// Vault Operations
// =============================================================================

async function checkVaultHealth(): Promise<boolean> {
  try {
    const response = await vaultRequest<{ initialized: boolean; sealed: boolean }>('GET', '/v1/sys/health');
    const health = response.data || response;
    console.log(`[INFO] Vault status: initialized=${(health as { initialized?: boolean }).initialized}, sealed=${(health as { sealed?: boolean }).sealed}`);
    return !(health as { sealed?: boolean }).sealed;
  } catch (error) {
    console.error('[ERROR] Failed to check Vault health:', error);
    return false;
  }
}

async function enableAppRoleAuth(): Promise<void> {
  console.log('[INFO] Checking AppRole auth method...');

  try {
    // Check if already enabled
    const authMethods = await vaultRequest<Record<string, unknown>>('GET', '/v1/sys/auth');
    const methods = authMethods.data || authMethods;

    if ((methods as Record<string, unknown>)['approle/']) {
      console.log('[INFO] AppRole auth already enabled');
      return;
    }
  } catch {
    // Auth listing failed, try to enable anyway
  }

  try {
    await vaultRequest('POST', '/v1/sys/auth/approle', {
      type: 'approle',
      description: 'AppRole authentication for Tamshai services',
    });
    console.log('[OK] AppRole auth enabled');
  } catch (error) {
    // May already exist
    if (String(error).includes('path is already in use')) {
      console.log('[INFO] AppRole auth already enabled');
    } else {
      throw error;
    }
  }
}

async function enableKvSecrets(): Promise<void> {
  console.log('[INFO] Checking KV secrets engine...');

  try {
    const mounts = await vaultRequest<Record<string, unknown>>('GET', '/v1/sys/mounts');
    const mountData = mounts.data || mounts;

    if ((mountData as Record<string, unknown>)['tamshai/']) {
      console.log('[INFO] KV secrets engine already enabled at tamshai/');
      return;
    }
  } catch {
    // Mount listing failed, try to enable anyway
  }

  try {
    await vaultRequest('POST', '/v1/sys/mounts/tamshai', {
      type: 'kv',
      options: { version: '2' },
      description: 'Tamshai application secrets',
    });
    console.log('[OK] KV secrets engine enabled at tamshai/');
  } catch (error) {
    if (String(error).includes('path is already in use')) {
      console.log('[INFO] KV secrets engine already enabled');
    } else {
      throw error;
    }
  }
}

async function syncPolicies(): Promise<void> {
  console.log('[INFO] Syncing Vault policies...');

  for (const [name, policy] of Object.entries(POLICIES)) {
    try {
      await vaultRequest('PUT', `/v1/sys/policies/acl/${name}`, {
        policy: policy.trim(),
      });
      console.log(`[OK] Policy synced: ${name}`);
    } catch (error) {
      console.error(`[ERROR] Failed to sync policy ${name}:`, error);
      throw error;
    }
  }
}

async function syncAppRoles(): Promise<void> {
  console.log('[INFO] Syncing AppRole roles...');

  for (const [name, config] of Object.entries(APPROLE_CONFIG)) {
    try {
      // Create/update the role
      await vaultRequest('POST', `/v1/auth/approle/role/${name}`, {
        token_policies: config.policies,
        token_ttl: config.tokenTtl,
        token_max_ttl: config.tokenMaxTtl,
        secret_id_ttl: config.secretIdTtl,
        secret_id_num_uses: config.secretIdNumUses,
        bind_secret_id: true,
      });

      // Set the custom role_id (stable identifier)
      await vaultRequest('POST', `/v1/auth/approle/role/${name}/role-id`, {
        role_id: config.roleId,
      });

      console.log(`[OK] AppRole synced: ${name} (role_id: ${config.roleId})`);
    } catch (error) {
      console.error(`[ERROR] Failed to sync AppRole ${name}:`, error);
      throw error;
    }
  }
}

interface SecretIdResponse {
  secret_id: string;
  secret_id_accessor: string;
  secret_id_ttl: number;
}

async function generateSecretIds(): Promise<Record<string, { roleId: string; secretId: string }>> {
  console.log('[INFO] Generating ephemeral SecretIDs...');

  const secretIds: Record<string, { roleId: string; secretId: string }> = {};

  for (const [name, config] of Object.entries(APPROLE_CONFIG)) {
    try {
      const response = await vaultRequest<SecretIdResponse>(
        'POST',
        `/v1/auth/approle/role/${name}/secret-id`,
        {
          ttl: config.secretIdTtl,
          num_uses: config.secretIdNumUses,
          metadata: JSON.stringify({
            generated_at: new Date().toISOString(),
            purpose: 'phoenix_rebuild',
          }),
        }
      );

      const secretData = response.data;
      if (!secretData?.secret_id) {
        throw new Error(`No secret_id in response for ${name}`);
      }

      secretIds[name] = {
        roleId: config.roleId,
        secretId: secretData.secret_id,
      };

      console.log(`[OK] SecretID generated: ${name} (ttl: ${config.secretIdTtl}, uses: ${config.secretIdNumUses})`);
    } catch (error) {
      console.error(`[ERROR] Failed to generate SecretID for ${name}:`, error);
      throw error;
    }
  }

  return secretIds;
}

// =============================================================================
// Database Secrets Engine (H5+)
// =============================================================================

async function syncDatabaseEngine(): Promise<void> {
  // Skip if database credentials not configured
  if (!VAULT_POSTGRES_USER || !VAULT_POSTGRES_PASSWORD) {
    console.log('[INFO] Skipping database secrets engine (VAULT_POSTGRES_USER/PASSWORD not set)');
    console.log('[INFO] To enable automatic password rotation, set these environment variables');
    return;
  }

  console.log('[INFO] Configuring database secrets engine (H5+)...');

  // Enable database secrets engine
  try {
    await vaultRequest('POST', '/v1/sys/mounts/database', {
      type: 'database',
      description: 'PostgreSQL credential rotation for Tamshai services',
    });
    console.log('[OK] Database secrets engine enabled');
  } catch (error) {
    if (String(error).includes('path is already in use')) {
      console.log('[INFO] Database secrets engine already enabled');
    } else {
      throw error;
    }
  }

  // Configure PostgreSQL connections for each database
  for (const dbName of DATABASE_CONFIG.databases) {
    const configPath = `/v1/database/config/postgresql-${dbName}`;
    const connectionUrl = `postgresql://{{username}}:{{password}}@${POSTGRES_HOST}:${POSTGRES_PORT}/${dbName}?sslmode=disable`;

    try {
      await vaultRequest('POST', configPath, {
        plugin_name: 'postgresql-database-plugin',
        connection_url: connectionUrl,
        username: VAULT_POSTGRES_USER,
        password: VAULT_POSTGRES_PASSWORD,
        allowed_roles: Object.keys(DATABASE_CONFIG.staticRoles),
      });
      console.log(`[OK] Database connection configured: ${dbName}`);
    } catch (error) {
      console.error(`[ERROR] Failed to configure database ${dbName}:`, error);
      throw error;
    }
  }

  // Configure static roles for credential rotation
  for (const [roleName, roleConfig] of Object.entries(DATABASE_CONFIG.staticRoles)) {
    // Use the first database for the static role (credentials work across all)
    const primaryDb = DATABASE_CONFIG.databases[0];
    const rolePath = `/v1/database/static-roles/${roleName}`;

    try {
      await vaultRequest('POST', rolePath, {
        db_name: `postgresql-${primaryDb}`,
        username: roleConfig.username,
        rotation_period: roleConfig.rotationPeriod,
        rotation_statements: roleConfig.rotationStatements,
      });
      console.log(`[OK] Static role configured: ${roleName} (rotation: ${roleConfig.rotationPeriod})`);
    } catch (error) {
      console.error(`[ERROR] Failed to configure static role ${roleName}:`, error);
      throw error;
    }
  }

  console.log('[OK] Database secrets engine configuration complete');
}

/**
 * Read current database credentials from Vault
 * Useful for debugging and verification
 */
async function readDatabaseCredentials(roleName: string): Promise<{ username: string; password: string } | null> {
  try {
    const response = await vaultRequest<{
      username: string;
      password: string;
      last_vault_rotation: string;
      ttl: number;
    }>('GET', `/v1/database/static-creds/${roleName}`);

    if (response.data) {
      console.log(`[INFO] Credentials for ${roleName}:`);
      console.log(`  Username: ${response.data.username}`);
      console.log(`  Last Rotation: ${response.data.last_vault_rotation}`);
      console.log(`  TTL: ${response.data.ttl}s`);
      return {
        username: response.data.username,
        password: response.data.password,
      };
    }
    return null;
  } catch (error) {
    console.error(`[ERROR] Failed to read credentials for ${roleName}:`, error);
    return null;
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const generateSecrets = process.argv.includes('--generate-secret-ids');
  const syncDatabase = process.argv.includes('--sync-database');
  const readDbCreds = process.argv.includes('--read-db-creds');

  console.log('=== Vault Synchronization (H1 + H5+) ===');
  console.log(`Vault Address: ${VAULT_ADDR}`);
  console.log(`Generate SecretIDs: ${generateSecrets}`);
  console.log(`Sync Database Engine: ${syncDatabase}`);
  console.log('');

  if (!VAULT_TOKEN) {
    console.error('[ERROR] VAULT_TOKEN or VAULT_DEV_ROOT_TOKEN is required');
    process.exit(1);
  }

  // Check Vault health
  const isHealthy = await checkVaultHealth();
  if (!isHealthy) {
    console.error('[ERROR] Vault is sealed or unhealthy');
    process.exit(1);
  }

  // Ensure KV secrets engine is enabled
  await enableKvSecrets();

  // Ensure AppRole auth is enabled
  await enableAppRoleAuth();

  // Sync policies
  await syncPolicies();

  // Sync AppRole roles
  await syncAppRoles();

  // Sync database secrets engine if requested or if credentials are available
  if (syncDatabase || (VAULT_POSTGRES_USER && VAULT_POSTGRES_PASSWORD)) {
    await syncDatabaseEngine();
  }

  // Generate SecretIDs if requested
  if (generateSecrets) {
    const secretIds = await generateSecretIds();

    console.log('');
    console.log('=== Generated SecretIDs (inject into .env) ===');
    console.log(JSON.stringify(secretIds, null, 2));

    // Output in a format that can be sourced by shell scripts
    console.log('');
    console.log('# Shell-compatible output:');
    for (const [name, creds] of Object.entries(secretIds)) {
      const envName = name.toUpperCase().replace(/-/g, '_');
      console.log(`export VAULT_${envName}_ROLE_ID="${creds.roleId}"`);
      console.log(`export VAULT_${envName}_SECRET_ID="${creds.secretId}"`);
    }
  }

  // Read database credentials if requested (for verification)
  if (readDbCreds) {
    console.log('');
    console.log('=== Database Credentials ===');
    await readDatabaseCredentials('tamshai-app');
  }

  console.log('');
  console.log('[OK] Vault synchronization complete');
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
