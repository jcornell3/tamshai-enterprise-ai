#!/bin/bash
# =============================================================================
# Vault AppRole Synchronization (H1 - Phoenix Vault AppRoles)
# =============================================================================
# Wrapper script for sync-vault.ts that can be called from deploy workflows.
#
# Usage:
#   ./scripts/vault/sync-vault.sh [--generate-secret-ids]
#
# Environment:
#   VAULT_ADDR - Vault server address
#   VAULT_TOKEN - Root/admin token
#
# Output:
#   When --generate-secret-ids is passed, exports environment variables
#   for each service's RoleID and SecretID.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check for required environment
if [ -z "${VAULT_ADDR:-}" ]; then
    echo "[ERROR] VAULT_ADDR is required"
    exit 1
fi

if [ -z "${VAULT_TOKEN:-}${VAULT_DEV_ROOT_TOKEN:-}" ]; then
    echo "[ERROR] VAULT_TOKEN or VAULT_DEV_ROOT_TOKEN is required"
    exit 1
fi

# Check if ts-node is available
if ! command -v npx &>/dev/null; then
    echo "[ERROR] npx is required (install Node.js)"
    exit 1
fi

# Run the TypeScript sync script
echo "[INFO] Running Vault sync..."
cd "$PROJECT_ROOT"

# Pass through arguments
npx ts-node "$SCRIPT_DIR/sync-vault.ts" "$@"

echo "[OK] Vault sync completed"
