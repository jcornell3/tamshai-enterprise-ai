# Security Remediation: C2 & C3 Implementation Plan

**Created**: 2026-02-18
**Author**: Tamshai-Dev (Claude-Dev)
**Status**: Detailed Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [C2: Encrypted Secrets at Rest](#c2-encrypted-secrets-at-rest)
3. [C3: Keycloak Admin Client (Node.js)](#c3-keycloak-admin-client-nodejs)
4. [Implementation Schedule](#implementation-schedule)
5. [Risk Mitigation](#risk-mitigation)
6. [Dependencies](#dependencies)

---

## Executive Summary

| Item | Current State | Target State | Effort |
|------|--------------|--------------|--------|
| C2 | Plaintext `.env` file on VPS disk | In-memory secrets, never written to disk | 3-4 days |
| C3 | Bash scripts with curl+jq | TypeScript admin client with type safety | 4-5 days |

**Total Effort**: 7-9 days (can be parallelized with 2 developers)

---

## C2: Encrypted Secrets at Rest

### Problem Statement

The current `cloud-init.yaml` writes secrets to `/tmp/tamshai.env`, decodes base64 passwords, and moves to `/opt/tamshai/.env`. This plaintext file persists on disk, creating a risk if the VPS is compromised.

**Current Flow:**
```
GitHub Secrets (encrypted)
    → Terraform (base64 encoded)
    → cloud-init (written to /tmp/tamshai.env)
    → base64 decode (shell script)
    → /opt/tamshai/.env (PLAINTEXT ON DISK)
```

### Target Architecture

```
GitHub Secrets (encrypted)
    → Terraform (AES-256 encrypted blob)
    → cloud-init (writes encrypted blob to /opt/tamshai/.env.enc)
    → startup script (decrypts in memory using instance key)
    → environment variables (NEVER written to disk)
    → docker-compose (receives secrets via --env-file /dev/stdin)
```

### Implementation Phases

---

### Phase C2.1: Encryption Infrastructure (Day 1)

#### Task C2.1.1: Create Encryption Key Derivation

**File**: `infrastructure/terraform/vps/encryption.tf`

The encryption key is derived from the VPS instance ID + a secret salt. This ensures:
- Each VPS has a unique key
- Key is deterministic (can be recreated during Phoenix rebuild)
- Key is never stored anywhere

```hcl
# infrastructure/terraform/vps/encryption.tf

# Salt for key derivation (stored in Terraform state, encrypted)
resource "random_password" "encryption_salt" {
  length  = 32
  special = false
}

# Derive encryption key from instance ID + salt
# This key exists only in memory during terraform apply
locals {
  # SHA-256 hash of instance_id + salt = 256-bit key
  encryption_key = sha256("${hcloud_server.vps.id}${random_password.encryption_salt.result}")
}

# Output for CI/CD (encrypted in state)
output "encryption_key_hash" {
  value     = sha256(local.encryption_key)
  sensitive = true
  description = "Hash of encryption key for verification (not the key itself)"
}
```

#### Task C2.1.2: Create Encryption Script for CI/CD

**File**: `scripts/secrets/encrypt-secrets.sh`

```bash
#!/bin/bash
# =============================================================================
# Encrypt Secrets for VPS Deployment
# =============================================================================
# Usage: ./encrypt-secrets.sh <env-file> <output-file>
#
# Reads plaintext secrets from env-file, encrypts using AES-256-GCM,
# and outputs a single encrypted blob.
#
# The encryption key is derived from:
#   HCLOUD_SERVER_ID + ENCRYPTION_SALT (both from Terraform outputs)
#
# =============================================================================

set -euo pipefail

ENV_FILE="${1:?Usage: $0 <env-file> <output-file>}"
OUTPUT_FILE="${2:?Usage: $0 <env-file> <output-file>}"

# Derive encryption key (must match cloud-init derivation)
if [ -z "${HCLOUD_SERVER_ID:-}" ] || [ -z "${ENCRYPTION_SALT:-}" ]; then
    echo "ERROR: HCLOUD_SERVER_ID and ENCRYPTION_SALT must be set"
    exit 1
fi

ENCRYPTION_KEY=$(echo -n "${HCLOUD_SERVER_ID}${ENCRYPTION_SALT}" | sha256sum | cut -d' ' -f1)

# Encrypt secrets using AES-256-GCM
# - Generate random IV (12 bytes for GCM)
# - Encrypt with authenticated encryption
# - Output format: IV (24 hex chars) + encrypted data (base64)

IV=$(openssl rand -hex 12)
ENCRYPTED=$(openssl enc -aes-256-gcm \
    -K "$ENCRYPTION_KEY" \
    -iv "$IV" \
    -in "$ENV_FILE" \
    -a)

# Output: IV:CIPHERTEXT
echo "${IV}:${ENCRYPTED}" > "$OUTPUT_FILE"

echo "Secrets encrypted to $OUTPUT_FILE"
```

#### Task C2.1.3: Create Decryption Script for VPS

**File**: `scripts/secrets/decrypt-secrets.sh`

```bash
#!/bin/bash
# =============================================================================
# Decrypt Secrets at VPS Startup
# =============================================================================
# Usage: source <(./decrypt-secrets.sh /opt/tamshai/.env.enc)
#
# Decrypts the encrypted secrets blob and outputs export statements.
# Secrets exist ONLY in memory - never written to disk.
#
# =============================================================================

set -euo pipefail

ENCRYPTED_FILE="${1:?Usage: source <($0 <encrypted-file>)}"

# Derive decryption key from instance metadata + salt
# Salt is embedded in the encrypted file header (first 64 chars)
INSTANCE_ID=$(curl -s http://169.254.169.254/hetzner/v1/metadata/instance-id)
SALT_FILE="/opt/tamshai/.encryption-salt"

if [ ! -f "$SALT_FILE" ]; then
    echo "ERROR: Encryption salt not found at $SALT_FILE" >&2
    exit 1
fi

ENCRYPTION_SALT=$(cat "$SALT_FILE")
DECRYPTION_KEY=$(echo -n "${INSTANCE_ID}${ENCRYPTION_SALT}" | sha256sum | cut -d' ' -f1)

# Parse encrypted file: IV:CIPHERTEXT
IFS=':' read -r IV CIPHERTEXT < "$ENCRYPTED_FILE"

# Decrypt in memory
DECRYPTED=$(echo "$CIPHERTEXT" | openssl enc -aes-256-gcm -d \
    -K "$DECRYPTION_KEY" \
    -iv "$IV" \
    -a)

# Output as export statements (for sourcing)
echo "$DECRYPTED" | while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue
    echo "export $line"
done
```

---

### Phase C2.2: Terraform Integration (Day 2)

#### Task C2.2.1: Update Terraform to Encrypt Secrets

**File**: `infrastructure/terraform/vps/main.tf` (modifications)

```hcl
# Generate encrypted secrets blob
resource "local_file" "encrypted_secrets" {
  filename = "${path.module}/.secrets.enc"
  content  = local.encrypted_secrets_blob

  # Ensure file is only readable by owner
  file_permission = "0600"
}

locals {
  # Build the plaintext secrets content
  plaintext_secrets = <<-EOT
    ENVIRONMENT=${var.environment}
    DOMAIN=${var.domain}
    KEYCLOAK_ADMIN=admin
    KEYCLOAK_ADMIN_PASSWORD=${var.keycloak_admin_password}
    # ... all other secrets ...
  EOT

  # Encrypt using external data source (calls encrypt script)
  encrypted_secrets_blob = data.external.encrypt_secrets.result.encrypted
}

data "external" "encrypt_secrets" {
  program = ["bash", "${path.module}/../../scripts/secrets/encrypt-terraform.sh"]

  query = {
    plaintext     = local.plaintext_secrets
    instance_id   = hcloud_server.vps.id
    salt          = random_password.encryption_salt.result
  }
}
```

#### Task C2.2.2: Update cloud-init.yaml

**File**: `infrastructure/terraform/vps/cloud-init.yaml` (modifications)

```yaml
write_files:
  # Encrypted secrets blob (not plaintext!)
  - path: /opt/tamshai/.env.enc
    permissions: '0600'
    encoding: base64
    content: ${encrypted_secrets_blob}

  # Encryption salt (needed for key derivation)
  - path: /opt/tamshai/.encryption-salt
    permissions: '0600'
    content: ${encryption_salt}

  # Decryption script
  - path: /opt/tamshai/scripts/decrypt-secrets.sh
    permissions: '0700'
    content: |
      #!/bin/bash
      # ... (full script from C2.1.3)

  # Startup script (replaces direct docker-compose call)
  - path: /opt/tamshai/scripts/start-services.sh
    permissions: '0700'
    content: |
      #!/bin/bash
      set -euo pipefail

      cd /opt/tamshai

      # Decrypt secrets into environment (in memory only)
      echo "Decrypting secrets..."
      eval "$(./scripts/decrypt-secrets.sh .env.enc)"

      # Verify critical secrets exist
      [ -n "$KEYCLOAK_ADMIN_PASSWORD" ] || { echo "ERROR: Secrets not loaded"; exit 1; }

      # Start docker-compose with environment variables
      # Secrets passed via environment, NOT via .env file
      cd infrastructure/docker

      # Create temporary env file in memory-backed tmpfs
      TEMP_ENV=$(mktemp -p /dev/shm)
      trap "rm -f $TEMP_ENV" EXIT

      # Write secrets to tmpfs (RAM-backed, never touches disk)
      env | grep -E '^(POSTGRES_|KEYCLOAK_|MONGODB_|REDIS_|CLAUDE_|MCP_|JWT_|ELASTIC_|MINIO_|VAULT_|E2E_|TEST_|PORT_|VITE_|LOG_|COMPOSE_|CADDYFILE|ENVIRONMENT|DOMAIN|SUPPORT_|ENABLE_|USER_|STAGE_)' > "$TEMP_ENV"

      # Start services
      docker compose --env-file "$TEMP_ENV" up -d

      echo "Services started with in-memory secrets"

runcmd:
  # ... (docker installation, repo clone, etc.)

  # Start services using new secure startup script
  - /opt/tamshai/scripts/start-services.sh

  # Remove any plaintext secrets that might have been created
  - rm -f /opt/tamshai/.env /tmp/tamshai.env
  - rm -f /opt/tamshai/infrastructure/docker/.env
```

---

### Phase C2.3: Docker Integration (Day 3)

#### Task C2.3.1: Modify Deploy Script

**File**: `infrastructure/terraform/vps/cloud-init.yaml` - deploy.sh section

```bash
#!/bin/bash
# Tamshai Enterprise AI - Secure Deployment Script
# Secrets are decrypted in memory, never written to disk

set -euo pipefail

cd /opt/tamshai

echo "=== Tamshai Deployment $(date) ==="

# Pull latest code
echo "Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Decrypt secrets into environment
echo "Loading secrets..."
eval "$(./scripts/decrypt-secrets.sh .env.enc)"

# Verify secrets loaded
[ -n "$KEYCLOAK_ADMIN_PASSWORD" ] || { echo "ERROR: Secrets not loaded"; exit 1; }

# Create RAM-backed temp env file
TEMP_ENV=$(mktemp -p /dev/shm)
trap "rm -f $TEMP_ENV" EXIT

# Export required variables to temp file
env | grep -E '^(POSTGRES_|KEYCLOAK_|MONGODB_|REDIS_|CLAUDE_|MCP_|JWT_|ELASTIC_|MINIO_|VAULT_|E2E_|TEST_|PORT_|VITE_|LOG_|COMPOSE_|CADDYFILE|ENVIRONMENT|DOMAIN|SUPPORT_|ENABLE_|USER_|STAGE_)' > "$TEMP_ENV"

# Deploy
cd infrastructure/docker
docker compose --env-file "$TEMP_ENV" pull
docker compose --env-file "$TEMP_ENV" build --no-cache
docker compose --env-file "$TEMP_ENV" up -d

# Cleanup
docker image prune -f

echo "=== Deployment complete ==="
```

#### Task C2.3.2: Update GitHub Actions Workflow

**File**: `.github/workflows/deploy-vps.yml` (modifications)

```yaml
- name: Encrypt secrets for VPS
  env:
    HCLOUD_SERVER_ID: ${{ secrets.HCLOUD_SERVER_ID }}
    ENCRYPTION_SALT: ${{ secrets.ENCRYPTION_SALT }}
  run: |
    # Create plaintext secrets file (in memory)
    cat > /dev/shm/secrets.env << 'EOF'
    KEYCLOAK_ADMIN_PASSWORD=${{ secrets.KEYCLOAK_ADMIN_PASSWORD }}
    POSTGRES_PASSWORD=${{ secrets.POSTGRES_PASSWORD }}
    # ... all secrets ...
    EOF

    # Encrypt
    ./scripts/secrets/encrypt-secrets.sh /dev/shm/secrets.env /dev/shm/secrets.enc

    # Upload encrypted blob to VPS
    scp /dev/shm/secrets.enc ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }}:/opt/tamshai/.env.enc

    # Clean up local secrets
    rm -f /dev/shm/secrets.env /dev/shm/secrets.enc
```

---

### Phase C2.4: Testing & Validation (Day 4)

#### Task C2.4.1: Create Validation Script

**File**: `scripts/secrets/validate-no-plaintext.sh`

```bash
#!/bin/bash
# =============================================================================
# Validate No Plaintext Secrets on Disk
# =============================================================================
# Run on VPS after deployment to verify secrets are not on disk

set -euo pipefail

echo "=== Checking for plaintext secrets on disk ==="

VIOLATIONS=0

# Check for .env files (should not exist)
for pattern in "/opt/tamshai/.env" "/opt/tamshai/infrastructure/docker/.env" "/tmp/*.env"; do
    if ls $pattern 2>/dev/null; then
        echo "VIOLATION: Found plaintext env file: $pattern"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done

# Check for known secret patterns in files
SECRETS_PATTERNS="KEYCLOAK_ADMIN_PASSWORD|POSTGRES_PASSWORD|CLAUDE_API_KEY|MCP_GATEWAY_CLIENT_SECRET"
if grep -r -l -E "$SECRETS_PATTERNS" /opt/tamshai --exclude="*.enc" --exclude-dir=".git" 2>/dev/null; then
    echo "VIOLATION: Found potential plaintext secrets in files"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Verify encrypted file exists
if [ ! -f /opt/tamshai/.env.enc ]; then
    echo "VIOLATION: Encrypted secrets file not found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check /dev/shm is used for temp files
if mount | grep -q "/dev/shm.*tmpfs"; then
    echo "OK: /dev/shm is RAM-backed tmpfs"
else
    echo "WARNING: /dev/shm may not be RAM-backed"
fi

if [ $VIOLATIONS -eq 0 ]; then
    echo "=== All checks passed: No plaintext secrets on disk ==="
    exit 0
else
    echo "=== FAILED: $VIOLATIONS violations found ==="
    exit 1
fi
```

#### Task C2.4.2: Integration Test

```bash
# Test sequence for Phoenix rebuild
1. terraform destroy -var-file=stage.tfvars
2. terraform apply -var-file=stage.tfvars
3. Wait for VPS boot (5 minutes)
4. SSH and run: /opt/tamshai/scripts/validate-no-plaintext.sh
5. Verify services are healthy: curl https://www.tamshai.com/api/health
6. Run E2E tests: npm run test:stage
```

---

## C3: Keycloak Admin Client (Node.js)

### Problem Statement

The current Keycloak management uses 17 bash scripts (1,500+ lines) with curl+jq. This is:
- Hard to maintain and test
- Error-prone (string manipulation in bash)
- No type safety
- Difficult to debug

### Target Architecture

A TypeScript-based admin client using `@keycloak/keycloak-admin-client`:
- Full type safety
- Unit testable
- Better error handling
- IDE support (autocomplete, refactoring)

---

### Phase C3.1: Project Setup (Day 1)

#### Task C3.1.1: Create Package Structure

```
keycloak/
├── scripts/                    # Existing bash scripts (deprecated)
│   └── lib/
├── admin-client/               # NEW: TypeScript admin client
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Main entry point
│   │   ├── client.ts           # Keycloak client wrapper
│   │   ├── config.ts           # Environment configuration
│   │   ├── sync/               # Sync operations
│   │   │   ├── clients.ts
│   │   │   ├── scopes.ts
│   │   │   ├── mappers.ts
│   │   │   ├── groups.ts
│   │   │   ├── users.ts
│   │   │   └── authz.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── retry.ts
│   └── tests/
│       ├── unit/
│       └── integration/
└── Dockerfile.admin-client     # Docker image for CI/CD
```

#### Task C3.1.2: Initialize Package

**File**: `keycloak/admin-client/package.json`

```json
{
  "name": "@tamshai/keycloak-admin",
  "version": "1.0.0",
  "description": "Keycloak administration client for Tamshai Enterprise AI",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "sync": "ts-node src/index.ts sync",
    "sync:dev": "ENV=dev ts-node src/index.ts sync",
    "sync:stage": "ENV=stage ts-node src/index.ts sync",
    "sync:prod": "ENV=prod ts-node src/index.ts sync"
  },
  "dependencies": {
    "@keycloak/keycloak-admin-client": "^25.0.0",
    "commander": "^12.0.0",
    "dotenv": "^16.4.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0",
    "ts-node": "^10.9.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "eslint": "^8.56.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

#### Task C3.1.3: TypeScript Configuration

**File**: `keycloak/admin-client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

### Phase C3.2: Core Client Implementation (Day 2)

#### Task C3.2.1: Configuration Module

**File**: `keycloak/admin-client/src/config.ts`

```typescript
import { config as loadEnv } from 'dotenv';

export interface KeycloakConfig {
  baseUrl: string;
  realmName: string;
  adminUser: string;
  adminPassword?: string;
  adminClientSecret?: string;
  environment: 'dev' | 'stage' | 'prod';
}

export interface ClientSecrets {
  mcpGateway: string;
  mcpHrService: string;
  mcpIntegrationRunner?: string;
  mcpUi: string;
}

export function loadConfig(): { keycloak: KeycloakConfig; secrets: ClientSecrets } {
  loadEnv();

  const env = (process.env.ENV || 'dev') as 'dev' | 'stage' | 'prod';

  const baseUrls: Record<string, string> = {
    dev: process.env.KEYCLOAK_URL || 'http://localhost:8180/auth',
    stage: process.env.KEYCLOAK_URL || 'https://www.tamshai.com/auth',
    prod: process.env.KEYCLOAK_URL || 'https://prod.tamshai.com/auth',
  };

  return {
    keycloak: {
      baseUrl: baseUrls[env],
      realmName: 'tamshai-corp',
      adminUser: process.env.KEYCLOAK_ADMIN || 'admin',
      adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
      adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
      environment: env,
    },
    secrets: {
      mcpGateway: process.env.MCP_GATEWAY_CLIENT_SECRET!,
      mcpHrService: process.env.MCP_HR_SERVICE_CLIENT_SECRET!,
      mcpIntegrationRunner: process.env.MCP_INTEGRATION_RUNNER_SECRET,
      mcpUi: process.env.MCP_UI_CLIENT_SECRET!,
    },
  };
}
```

#### Task C3.2.2: Keycloak Client Wrapper

**File**: `keycloak/admin-client/src/client.ts`

```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';
import type { KeycloakConfig } from './config.js';
import { logger } from './utils/logger.js';

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

    try {
      if (this.config.adminClientSecret) {
        // Prefer client credentials grant (M2 fix)
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
    } catch (error) {
      logger.error('Failed to authenticate to Keycloak', { error });
      throw error;
    }
  }

  async setRealm(realmName: string): Promise<void> {
    this.client.setConfig({ realmName });
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
}
```

---

### Phase C3.3: Sync Operations (Days 3-4)

#### Task C3.3.1: Client Sync

**File**: `keycloak/admin-client/src/sync/clients.ts`

```typescript
import type ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation.js';
import type { KeycloakAdminWrapper } from '../client.js';
import type { ClientSecrets } from '../config.js';
import { logger } from '../utils/logger.js';

export interface ClientConfig {
  clientId: string;
  name: string;
  description: string;
  publicClient: boolean;
  standardFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  fullScopeAllowed: boolean;
  redirectUris: string[];
  webOrigins: string[];
  defaultClientScopes: string[];
  secret?: string;
}

export class ClientSync {
  constructor(
    private kc: KeycloakAdminWrapper,
    private secrets: ClientSecrets,
    private environment: 'dev' | 'stage' | 'prod'
  ) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing Keycloak clients...');

    // MCP Gateway
    await this.syncClient(this.getMcpGatewayConfig());

    // MCP HR Service
    await this.syncClient(this.getMcpHrServiceConfig());

    // MCP UI
    await this.syncClient(this.getMcpUiConfig());

    // MCP Integration Runner (dev/ci only)
    if (this.environment === 'dev') {
      await this.syncClient(this.getMcpIntegrationRunnerConfig());
    }

    // Web Portal
    await this.syncClient(this.getWebPortalConfig());

    // Flutter Client
    await this.syncClient(this.getFlutterClientConfig());

    logger.info('Client sync complete');
  }

  private async syncClient(config: ClientConfig): Promise<void> {
    const { clientId } = config;
    logger.info(`Syncing client: ${clientId}`);

    try {
      // Check if client exists
      const existing = await this.kc.clients.find({ clientId });

      const clientRep: ClientRepresentation = {
        clientId: config.clientId,
        name: config.name,
        description: config.description,
        enabled: true,
        publicClient: config.publicClient,
        standardFlowEnabled: config.standardFlowEnabled,
        directAccessGrantsEnabled: config.directAccessGrantsEnabled,
        serviceAccountsEnabled: config.serviceAccountsEnabled,
        fullScopeAllowed: config.fullScopeAllowed,
        protocol: 'openid-connect',
        redirectUris: config.redirectUris,
        webOrigins: config.webOrigins,
        defaultClientScopes: config.defaultClientScopes,
      };

      if (existing.length > 0) {
        // Update existing client
        const id = existing[0].id!;
        await this.kc.clients.update({ id }, clientRep);
        logger.info(`  Updated existing client: ${clientId}`);

        // Set secret if provided
        if (config.secret) {
          await this.kc.clients.update({ id }, { secret: config.secret });
          logger.info(`  Updated client secret`);
        }
      } else {
        // Create new client
        if (config.secret) {
          clientRep.secret = config.secret;
        }
        await this.kc.clients.create(clientRep);
        logger.info(`  Created new client: ${clientId}`);
      }
    } catch (error) {
      logger.error(`Failed to sync client ${clientId}`, { error });
      throw error;
    }
  }

  private getMcpGatewayConfig(): ClientConfig {
    const domain = this.getDomain();
    return {
      clientId: 'mcp-gateway',
      name: 'MCP Gateway',
      description: 'Backend service for AI orchestration',
      publicClient: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false, // Security: ROPC disabled
      serviceAccountsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [
        'http://localhost:3100/*',
        `https://${domain}/*`,
        `https://${domain}/api/*`,
      ],
      webOrigins: this.getWebOrigins(), // E3 fix: explicit origins
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
      secret: this.secrets.mcpGateway,
    };
  }

  private getMcpHrServiceConfig(): ClientConfig {
    return {
      clientId: 'mcp-hr-service',
      name: 'MCP HR Identity Sync Service',
      description: 'Service account for syncing HR employees to Keycloak users',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false, // M1 fix: minimal scope
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['profile', 'email', 'roles'],
      secret: this.secrets.mcpHrService,
    };
  }

  private getMcpUiConfig(): ClientConfig {
    return {
      clientId: 'mcp-ui',
      name: 'MCP UI Service',
      description: 'Generative UI component renderer',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false,
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['profile', 'email', 'roles'],
      secret: this.secrets.mcpUi,
    };
  }

  private getMcpIntegrationRunnerConfig(): ClientConfig {
    return {
      clientId: 'mcp-integration-runner',
      name: 'MCP Integration Test Runner',
      description: 'Service account for integration tests with token exchange',
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: true,
      redirectUris: [],
      webOrigins: [],
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
      secret: this.secrets.mcpIntegrationRunner,
    };
  }

  private getWebPortalConfig(): ClientConfig {
    const domain = this.getDomain();
    return {
      clientId: 'web-portal',
      name: 'Web Portal',
      description: 'Employee web portal (SPA)',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: true,
      redirectUris: [
        'http://localhost:4000/*',
        `https://${domain}/*`,
        `https://${domain}/app/*`,
      ],
      webOrigins: this.getWebOrigins(),
      defaultClientScopes: ['openid', 'profile', 'email', 'roles'],
    };
  }

  private getFlutterClientConfig(): ClientConfig {
    return {
      clientId: 'tamshai-flutter',
      name: 'Tamshai Flutter Client',
      description: 'Desktop and mobile application',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: true,
      redirectUris: [
        'tamshai://callback',
        'http://localhost:18765/*',
        'http://localhost:18766/*',
        'http://localhost:18767/*',
        'http://localhost:18768/*',
        'http://localhost:18769/*',
      ],
      webOrigins: ['+'], // Required for desktop OAuth
      defaultClientScopes: ['openid', 'profile', 'email', 'roles', 'offline_access'],
    };
  }

  private getDomain(): string {
    const domains: Record<string, string> = {
      dev: 'www.tamshai.local',
      stage: 'www.tamshai.com',
      prod: 'prod.tamshai.com',
    };
    return domains[this.environment];
  }

  private getWebOrigins(): string[] {
    // E3 fix: Explicit webOrigins per environment
    const origins: Record<string, string[]> = {
      dev: [
        'http://localhost:3100',
        'http://localhost:4000',
        'http://localhost:4001',
        'http://localhost:4002',
        'http://localhost:4003',
        'http://localhost:4004',
        'https://www.tamshai.local',
        'https://www.tamshai.local:8443',
      ],
      stage: ['https://www.tamshai.com'],
      prod: ['https://prod.tamshai.com'],
    };
    return origins[this.environment];
  }
}
```

#### Task C3.3.2: Groups and Roles Sync

**File**: `keycloak/admin-client/src/sync/groups.ts`

```typescript
import type { KeycloakAdminWrapper } from '../client.js';
import { logger } from '../utils/logger.js';

interface GroupConfig {
  name: string;
  realmRoles: string[];
}

export class GroupSync {
  constructor(
    private kc: KeycloakAdminWrapper,
    private environment: 'dev' | 'stage' | 'prod'
  ) {}

  async syncAll(): Promise<void> {
    logger.info('Syncing Keycloak groups...');

    await this.syncGroup({
      name: 'C-Suite',
      realmRoles: ['executive'],
    });

    await this.syncGroup({
      name: 'All-Employees',
      realmRoles: ['user'],
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
      const exactMatch = existing.find(g => g.name === name);

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
        const role = await this.kc.roles.findOneByName({ name: roleName });
        if (role) {
          await this.kc.groups.addRealmRoleMappings({
            id: groupId,
            roles: [{ id: role.id!, name: role.name! }],
          });
          logger.info(`  Assigned role ${roleName} to group ${name}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to sync group ${name}`, { error });
      throw error;
    }
  }

  private async assignCriticalUsers(): Promise<void> {
    // E2 fix: test-user.journey only gets All-Employees (not C-Suite)
    const criticalUsers: Array<{ username: string; groupName: string }> = [
      { username: 'eve.thompson', groupName: 'C-Suite' },
      { username: 'michael.roberts', groupName: 'C-Suite' },
      { username: 'sarah.kim', groupName: 'C-Suite' },
      { username: 'james.wilson', groupName: 'C-Suite' },
      { username: 'test-user.journey', groupName: 'All-Employees' },
      // Note: test-user.journey NOT added to C-Suite (E2 security fix)
    ];

    for (const { username, groupName } of criticalUsers) {
      await this.assignUserToGroup(username, groupName);
    }
  }

  private async assignUserToGroup(username: string, groupName: string): Promise<void> {
    try {
      const users = await this.kc.users.find({ username, exact: true });
      if (users.length === 0) {
        logger.warn(`User ${username} not found, skipping group assignment`);
        return;
      }

      const groups = await this.kc.groups.find({ search: groupName });
      const group = groups.find(g => g.name === groupName);
      if (!group) {
        logger.warn(`Group ${groupName} not found`);
        return;
      }

      await this.kc.users.addToGroup({
        id: users[0].id!,
        groupId: group.id!,
      });

      logger.info(`Assigned ${username} to ${groupName}`);
    } catch (error) {
      logger.warn(`Could not assign ${username} to ${groupName}`, { error });
    }
  }
}
```

#### Task C3.3.3: Main Entry Point

**File**: `keycloak/admin-client/src/index.ts`

```typescript
import { program } from 'commander';
import { loadConfig } from './config.js';
import { KeycloakAdminWrapper } from './client.js';
import { ClientSync } from './sync/clients.js';
import { GroupSync } from './sync/groups.js';
import { ScopeSync } from './sync/scopes.js';
import { MapperSync } from './sync/mappers.js';
import { UserSync } from './sync/users.js';
import { AuthzSync } from './sync/authz.js';
import { logger } from './utils/logger.js';

async function runSync(): Promise<void> {
  const { keycloak, secrets } = loadConfig();

  logger.info('==========================================');
  logger.info('Keycloak Realm Sync - Starting');
  logger.info(`Environment: ${keycloak.environment}`);
  logger.info('==========================================');

  const kc = new KeycloakAdminWrapper(keycloak);
  await kc.authenticate();
  await kc.setRealm(keycloak.realmName);

  // Sync operations (order matters)
  const scopeSync = new ScopeSync(kc);
  await scopeSync.syncAll();

  const clientSync = new ClientSync(kc, secrets, keycloak.environment);
  await clientSync.syncAll();

  const mapperSync = new MapperSync(kc);
  await mapperSync.syncAll();

  const groupSync = new GroupSync(kc, keycloak.environment);
  await groupSync.syncAll();

  const userSync = new UserSync(kc, keycloak.environment);
  await userSync.syncAll();

  // Token exchange permissions (dev/ci only)
  if (keycloak.environment === 'dev') {
    const authzSync = new AuthzSync(kc);
    await authzSync.syncTokenExchange();
  }

  logger.info('==========================================');
  logger.info('Keycloak Realm Sync - Complete');
  logger.info('==========================================');
}

program
  .name('keycloak-admin')
  .description('Keycloak administration for Tamshai Enterprise AI')
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

program.parse();
```

---

### Phase C3.4: Testing (Day 5)

#### Task C3.4.1: Unit Tests

**File**: `keycloak/admin-client/tests/unit/clients.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientSync } from '../../src/sync/clients.js';

describe('ClientSync', () => {
  const mockKc = {
    clients: {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockSecrets = {
    mcpGateway: 'test-gateway-secret',
    mcpHrService: 'test-hr-secret',
    mcpUi: 'test-ui-secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMcpGatewayConfig', () => {
    it('returns explicit webOrigins for dev environment', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.webOrigins).toContain('http://localhost:3100');
      expect(config.webOrigins).toContain('https://www.tamshai.local');
      expect(config.webOrigins).not.toContain('+');
    });

    it('returns single origin for stage environment', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'stage');
      const config = (sync as any).getMcpGatewayConfig();

      expect(config.webOrigins).toEqual(['https://www.tamshai.com']);
    });
  });

  describe('getMcpHrServiceConfig', () => {
    it('has fullScopeAllowed set to false (M1 security fix)', () => {
      const sync = new ClientSync(mockKc as any, mockSecrets, 'dev');
      const config = (sync as any).getMcpHrServiceConfig();

      expect(config.fullScopeAllowed).toBe(false);
    });
  });
});
```

#### Task C3.4.2: Integration Test Script

**File**: `keycloak/admin-client/tests/integration/sync.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { KeycloakAdminWrapper } from '../../src/client.js';

describe('Keycloak Sync Integration', () => {
  let kc: KeycloakAdminWrapper;

  beforeAll(async () => {
    const { keycloak } = loadConfig();
    kc = new KeycloakAdminWrapper(keycloak);
    await kc.authenticate();
    await kc.setRealm(keycloak.realmName);
  });

  it('can list clients', async () => {
    const clients = await kc.clients.find();
    expect(clients.length).toBeGreaterThan(0);
  });

  it('mcp-gateway client exists', async () => {
    const clients = await kc.clients.find({ clientId: 'mcp-gateway' });
    expect(clients.length).toBe(1);
    expect(clients[0].clientId).toBe('mcp-gateway');
  });

  it('C-Suite group exists', async () => {
    const groups = await kc.groups.find({ search: 'C-Suite' });
    expect(groups.some(g => g.name === 'C-Suite')).toBe(true);
  });
});
```

---

### Phase C3.5: CI/CD Integration (Day 5)

#### Task C3.5.1: Docker Image

**File**: `keycloak/Dockerfile.admin-client`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY admin-client/package*.json ./
RUN npm ci --only=production

# Copy source
COPY admin-client/dist ./dist

# Default command
ENTRYPOINT ["node", "dist/index.js"]
CMD ["sync"]
```

#### Task C3.5.2: Update cloud-init.yaml

Replace the bash script execution with Node.js admin client:

```yaml
# In runcmd section, replace:
#   docker exec ... /tmp/keycloak-scripts/sync-realm.sh stage
# With:
  - |
    cd /opt/tamshai/keycloak/admin-client
    npm ci
    npm run build
    ENV=stage npm run sync
```

---

## Implementation Schedule

| Week | Day | Task | Owner |
|------|-----|------|-------|
| 1 | Mon | C2.1: Encryption infrastructure | Dev 1 |
| 1 | Mon | C3.1: Project setup | Dev 2 |
| 1 | Tue | C2.2: Terraform integration | Dev 1 |
| 1 | Tue | C3.2: Core client implementation | Dev 2 |
| 1 | Wed | C2.3: Docker integration | Dev 1 |
| 1 | Wed | C3.3: Sync operations (clients, scopes) | Dev 2 |
| 1 | Thu | C2.4: Testing & validation | Dev 1 |
| 1 | Thu | C3.3: Sync operations (groups, users, authz) | Dev 2 |
| 1 | Fri | Integration testing | Both |
| 2 | Mon | C3.4: Unit tests | Dev 2 |
| 2 | Tue | C3.5: CI/CD integration | Both |
| 2 | Wed | End-to-end validation | Both |
| 2 | Thu | Documentation | Both |
| 2 | Fri | Production deployment | Both |

---

## Risk Mitigation

### C2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Encryption key lost | Cannot decrypt secrets | Key derived from instance ID + salt; salt stored in Terraform state |
| tmpfs not available | Secrets written to disk | Check /dev/shm exists and is tmpfs at startup |
| Decryption fails | Services cannot start | Keep backup of plaintext .env in GitHub Secrets (encrypted) |

### C3 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| API incompatibility | Sync fails | Pin @keycloak/keycloak-admin-client version |
| Missing functionality | Cannot replicate all bash features | Keep bash scripts as fallback (deprecated but functional) |
| Performance | Slower than bash | Acceptable for one-shot sync operations |

---

## Dependencies

### C2 Dependencies

- Hetzner Cloud: Instance metadata API (`169.254.169.254`)
- OpenSSL: AES-256-GCM encryption
- tmpfs: RAM-backed `/dev/shm`

### C3 Dependencies

- Node.js 20+
- @keycloak/keycloak-admin-client v25+
- TypeScript 5.3+
- Keycloak 24+ (API compatibility)

---

## Rollback Procedures

### C2 Rollback

```bash
# Restore plaintext secrets approach
1. Revert cloud-init.yaml to previous version
2. terraform destroy && terraform apply
3. Verify services start with plaintext .env
```

### C3 Rollback

```bash
# Continue using bash scripts
1. Revert cloud-init.yaml to call sync-realm.sh
2. Bash scripts remain functional in keycloak/scripts/
3. No Terraform changes needed
```

---

*Plan Author: Tamshai-Dev (Claude-Dev)*
*Review Required Before Implementation*
