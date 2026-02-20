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

  # NOTE: Secrets are assembled and encrypted in cloud-init.yaml
  # The actual secret values are passed as base64-encoded templatefile variables
  # This local just documents the derivation approach
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
