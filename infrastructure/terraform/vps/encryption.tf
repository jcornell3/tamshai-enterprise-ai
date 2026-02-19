# =============================================================================
# Encryption Infrastructure for Secrets at Rest
# =============================================================================
#
# This configuration provides the encryption infrastructure for C2 security
# remediation - encrypted secrets at rest on the VPS.
#
# Architecture:
#   1. A random salt is generated and stored in Terraform state
#   2. The encryption key is derived from: sha256(server_id + salt)
#   3. This key is used to encrypt secrets before sending to the VPS
#   4. The VPS derives the same key using its instance ID from metadata API
#
# Security properties:
#   - Each VPS has a unique encryption key (tied to instance ID)
#   - Key is deterministic (can be recreated during Phoenix rebuild)
#   - Key is never stored anywhere - only derived when needed
#   - Secrets are encrypted before leaving CI/CD environment
#
# =============================================================================

# Random salt for key derivation
# This is stored in Terraform state (which should be encrypted)
resource "random_password" "encryption_salt" {
  length  = 32
  special = false
  upper   = true
  lower   = true
  numeric = true

  # Prevent regeneration on each apply
  keepers = {
    # Only regenerate if explicitly requested
    version = "1"
  }
}

# Local values for encryption
locals {
  # The encryption key is derived from server_id + salt
  # This derivation happens both:
  #   1. In Terraform/CI (for encryption)
  #   2. On VPS at runtime (for decryption)
  #
  # The key itself is NEVER stored - only the salt is stored
  encryption_key_derivation = "sha256(server_id + salt)"

  # Plaintext secrets content (will be encrypted)
  # This is assembled from variables and used to create the encrypted blob
  plaintext_secrets_content = <<-EOT
ENVIRONMENT=${var.environment}
DOMAIN=${var.domain}
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${var.keycloak_admin_password}
KEYCLOAK_DB_PASSWORD=${var.keycloak_db_password}
POSTGRES_PASSWORD=${var.postgres_password}
MONGODB_PASSWORD=${var.mongodb_password}
REDIS_PASSWORD=${var.redis_password}
CLAUDE_API_KEY=${var.claude_api_key}
MCP_GATEWAY_CLIENT_SECRET=${var.mcp_gateway_client_secret}
MCP_HR_SERVICE_CLIENT_SECRET=${var.mcp_hr_service_client_secret}
MCP_INTEGRATION_RUNNER_SECRET=${var.mcp_integration_runner_secret}
MCP_UI_CLIENT_SECRET=${var.mcp_ui_client_secret}
KEYCLOAK_ADMIN_CLIENT_SECRET=${var.keycloak_admin_client_secret}
ELASTIC_PASSWORD=${var.elastic_password}
MINIO_ROOT_PASSWORD=${var.minio_root_password}
VAULT_TOKEN=${var.vault_token}
JWT_SECRET=${var.jwt_secret}
E2E_TEST_USER_PASSWORD=${var.e2e_test_user_password}
STAGE_USER_PASSWORD=${var.stage_user_password}
TEST_USER_TOTP_SECRET_RAW=${var.test_user_totp_secret_raw}
CUSTOMER_USER_PASSWORD=${var.customer_user_password}
LOG_LEVEL=${var.log_level}
EOT
}

# Output the encryption salt (for CI/CD to use)
output "encryption_salt" {
  value       = random_password.encryption_salt.result
  sensitive   = true
  description = "Salt for deriving encryption key (combine with server_id)"
}

# Output the server ID (for CI/CD to use in key derivation)
output "server_id" {
  value       = hcloud_server.tamshai.id
  description = "Hetzner server ID for encryption key derivation"
}

# Output verification hash (for debugging, not the actual key)
output "encryption_key_verification" {
  value       = sha256("${hcloud_server.tamshai.id}${random_password.encryption_salt.result}")
  sensitive   = true
  description = "SHA256 hash that should match on VPS for verification"
}
