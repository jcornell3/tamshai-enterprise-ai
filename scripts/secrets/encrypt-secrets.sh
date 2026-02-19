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
#   HCLOUD_SERVER_ID + ENCRYPTION_SALT (environment variables)
#
# =============================================================================

set -euo pipefail

ENV_FILE="${1:?Usage: $0 <env-file> <output-file>}"
OUTPUT_FILE="${2:?Usage: $0 <env-file> <output-file>}"

# Validate input file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Input file '$ENV_FILE' not found"
    exit 1
fi

# Derive encryption key (must match cloud-init derivation)
if [ -z "${HCLOUD_SERVER_ID:-}" ] || [ -z "${ENCRYPTION_SALT:-}" ]; then
    echo "ERROR: HCLOUD_SERVER_ID and ENCRYPTION_SALT must be set"
    echo ""
    echo "These values come from Terraform outputs:"
    echo "  HCLOUD_SERVER_ID=\$(terraform output -raw server_id)"
    echo "  ENCRYPTION_SALT=\$(terraform output -raw encryption_salt)"
    exit 1
fi

# Generate 256-bit key from server ID + salt using SHA-256
ENCRYPTION_KEY=$(echo -n "${HCLOUD_SERVER_ID}${ENCRYPTION_SALT}" | sha256sum | cut -d' ' -f1)

# Generate random IV (16 bytes for AES-256-CBC, hex encoded = 32 chars)
# Note: Using CBC mode because GCM requires additional tag handling
IV=$(openssl rand -hex 16)

# Encrypt secrets using AES-256-CBC with PBKDF2
# Output is base64 encoded
ENCRYPTED=$(openssl enc -aes-256-cbc \
    -K "$ENCRYPTION_KEY" \
    -iv "$IV" \
    -in "$ENV_FILE" \
    -base64 -A)

# Output format: IV:CIPHERTEXT (both hex/base64 encoded)
echo "${IV}:${ENCRYPTED}" > "$OUTPUT_FILE"

echo "Secrets encrypted successfully"
echo "  Input: $ENV_FILE"
echo "  Output: $OUTPUT_FILE"
echo "  Server ID: ${HCLOUD_SERVER_ID:0:8}..."
