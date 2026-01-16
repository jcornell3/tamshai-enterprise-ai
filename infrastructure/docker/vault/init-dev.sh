#!/bin/sh
# =============================================================================
# Tamshai Vault Dev Initialization
# =============================================================================
#
# Configures Vault secrets engines and policies for local development.
# This script runs once after Vault starts in dev mode.
#
# =============================================================================

set -e

echo "=== Initializing Vault for Development ==="

# Wait for Vault to be ready
sleep 2

# Enable KV secrets engine for application secrets
echo "Enabling KV secrets engine..."
vault secrets enable -path=tamshai kv-v2 2>/dev/null || echo "KV engine already enabled"

# Store development secrets
echo "Storing development secrets..."
vault kv put tamshai/mcp-gateway \
    claude_api_key="${CLAUDE_API_KEY:-sk-ant-test-key}" \
    keycloak_client_secret="${KEYCLOAK_CLIENT_SECRET:-mcp-gateway-secret}"

vault kv put tamshai/databases \
    postgres_password="${POSTGRES_PASSWORD:-postgres_password}" \
    mongodb_password="${MONGODB_PASSWORD:-tamshai_password}" \
    keycloak_db_password="${KEYCLOAK_DB_PASSWORD:-keycloak_password}"

vault kv put tamshai/keycloak \
    admin_password="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required}"

# Create read-only policy for MCP services
echo "Creating policies..."
vault policy write mcp-service - <<EOF
# Read-only access to MCP Gateway secrets
path "tamshai/data/mcp-gateway" {
  capabilities = ["read"]
}

# Read-only access to database credentials
path "tamshai/data/databases" {
  capabilities = ["read"]
}
EOF

vault policy write keycloak-service - <<EOF
# Read-only access to Keycloak secrets
path "tamshai/data/keycloak" {
  capabilities = ["read"]
}

# Read-only access to database credentials
path "tamshai/data/databases" {
  capabilities = ["read"]
}
EOF

# Enable AppRole auth for service authentication
echo "Enabling AppRole auth..."
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

# Create AppRole for MCP Gateway
vault write auth/approle/role/mcp-gateway \
    secret_id_ttl=24h \
    token_policies="mcp-service" \
    token_ttl=1h \
    token_max_ttl=4h

# Create AppRole for Keycloak
vault write auth/approle/role/keycloak \
    secret_id_ttl=24h \
    token_policies="keycloak-service" \
    token_ttl=1h \
    token_max_ttl=4h

# Output role IDs for configuration (dev only - in prod these would be injected)
echo ""
echo "=== Vault Dev Configuration Complete ==="
echo ""
echo "MCP Gateway Role ID:"
vault read -field=role_id auth/approle/role/mcp-gateway/role-id
echo ""
echo ""
echo "Keycloak Role ID:"
vault read -field=role_id auth/approle/role/keycloak/role-id
echo ""
echo ""
echo "To get a secret ID (dev only):"
echo "  vault write -f auth/approle/role/mcp-gateway/secret-id"
echo ""
echo "Vault UI available at: http://localhost:8200"
echo "Dev root token: ${VAULT_TOKEN}"
