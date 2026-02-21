#!/bin/bash
# =============================================================================
# Decrypt Secrets for Local Dev Environment
# =============================================================================
# Usage: source <(./decrypt-secrets-dev.sh)
#    or: ./decrypt-secrets-dev.sh > /tmp/env && source /tmp/env
#
# Decrypts the encrypted secrets blob and outputs environment variables.
# Secrets exist ONLY in memory - never written to disk.
#
# The decryption key is derived from:
#   - GitHub username (from gh CLI)
#   - Encryption salt (stored in infrastructure/docker/.encryption-salt)
#
# This mirrors the VPS decrypt-secrets.sh but uses GitHub username instead
# of Hetzner instance ID for key derivation.
#
# Created: 2026-02-21
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

ENCRYPTED_FILE="${1:-$DOCKER_DIR/.env.enc}"
SALT_FILE="${2:-$DOCKER_DIR/.encryption-salt}"

# =============================================================================
# VALIDATION
# =============================================================================

# Verify encrypted file exists
if [ ! -f "$ENCRYPTED_FILE" ]; then
    echo "ERROR: Encrypted file not found at $ENCRYPTED_FILE" >&2
    echo "  Run 'terraform apply' to generate encrypted secrets" >&2
    exit 1
fi

# Verify salt file exists
if [ ! -f "$SALT_FILE" ]; then
    echo "ERROR: Encryption salt not found at $SALT_FILE" >&2
    echo "  Run 'terraform apply' to generate encryption salt" >&2
    exit 1
fi

# Verify gh CLI is installed
if ! command -v gh &>/dev/null; then
    echo "ERROR: gh CLI not found" >&2
    echo "  Install with: winget install GitHub.cli" >&2
    exit 1
fi

# Get GitHub username
GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")

if [ -z "$GITHUB_USER" ]; then
    echo "ERROR: Could not get GitHub username" >&2
    echo "  Authenticate with: gh auth login" >&2
    exit 1
fi

# =============================================================================
# DECRYPTION
# =============================================================================

# Read encryption salt
ENCRYPTION_SALT=$(cat "$SALT_FILE")

# Derive decryption key: SHA256(github_username + salt)
# This must match the key derivation in main.tf
DECRYPTION_KEY=$(echo -n "${GITHUB_USER}${ENCRYPTION_SALT}" | openssl dgst -sha256 | awk '{print $NF}')

# Parse encrypted file: IV:CIPHERTEXT
IFS=':' read -r IV CIPHERTEXT < "$ENCRYPTED_FILE"

if [ -z "$IV" ] || [ -z "$CIPHERTEXT" ]; then
    echo "ERROR: Invalid encrypted file format (expected IV:CIPHERTEXT)" >&2
    exit 1
fi

# Decrypt in memory
DECRYPTED=$(echo "$CIPHERTEXT" | openssl enc -aes-256-cbc -d \
    -K "$DECRYPTION_KEY" \
    -iv "$IV" \
    -base64 -A 2>/dev/null)

if [ -z "$DECRYPTED" ]; then
    echo "ERROR: Decryption failed" >&2
    echo "  Possible causes:" >&2
    echo "    - Different GitHub user than who created the encryption" >&2
    echo "    - Corrupted .env.enc or .encryption-salt file" >&2
    echo "    - Run 'terraform apply' to re-encrypt with your credentials" >&2
    exit 1
fi

# Output the decrypted content
echo "$DECRYPTED"
