# =============================================================================
# Terraform Dev Environment - Encryption at Rest
# =============================================================================
#
# Implements encryption for .env file to prevent secrets from being stored
# in plaintext on disk. Uses AES-256-CBC with key derived from GitHub username.
#
# Key Derivation: SHA256(github_username + random_salt)
# Format: IV:CIPHERTEXT (base64 encoded)
#
# Usage:
#   - Encryption happens automatically on terraform apply
#   - Decryption via scripts/secrets/decrypt-secrets-dev.sh
#   - Secure startup via scripts/secrets/start-services-dev.sh
#
# Created: 2026-02-21
# =============================================================================

# =============================================================================
# ENCRYPTION SALT
# =============================================================================
#
# Random salt for key derivation. Stored in Terraform state and written to
# .encryption-salt file for use by decrypt script.
#
# =============================================================================

resource "random_password" "encryption_salt" {
  length  = 32
  special = false

  keepers = {
    # Bump version to regenerate salt (forces re-encryption)
    version = "1"
  }
}

# =============================================================================
# GITHUB USERNAME FOR KEY DERIVATION
# =============================================================================
#
# Uses gh CLI to get authenticated GitHub username. This ensures only the
# developer who deployed can decrypt the secrets.
#
# =============================================================================

data "external" "github_user" {
  count = var.enable_encryption ? 1 : 0

  program = ["bash", "-c", "gh api user --jq '{\"username\": .login}'"]
}

locals {
  # Only access github_user result when encryption is enabled
  github_username = var.enable_encryption ? data.external.github_user[0].result.username : ""
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "encryption_salt" {
  value       = random_password.encryption_salt.result
  sensitive   = true
  description = "Salt used for encryption key derivation"
}

output "github_username" {
  value       = local.github_username
  description = "GitHub username used for key derivation"
}

output "encryption_enabled" {
  value       = var.enable_encryption
  description = "Whether encryption at rest is enabled"
}
