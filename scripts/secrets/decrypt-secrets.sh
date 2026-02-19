#!/bin/bash
# =============================================================================
# Decrypt Secrets at VPS Startup
# =============================================================================
# Usage: source <(./decrypt-secrets.sh /opt/tamshai/.env.enc)
#
# Decrypts the encrypted secrets blob and outputs export statements.
# Secrets exist ONLY in memory - never written to disk.
#
# The decryption key is derived from:
#   - Instance ID (from Hetzner metadata API)
#   - Encryption salt (stored in /opt/tamshai/.encryption-salt)
#
# =============================================================================

set -euo pipefail

ENCRYPTED_FILE="${1:?Usage: source <($0 <encrypted-file>)}"

# Validate encrypted file exists
if [ ! -f "$ENCRYPTED_FILE" ]; then
    echo "ERROR: Encrypted file '$ENCRYPTED_FILE' not found" >&2
    exit 1
fi

# Get instance ID from Hetzner metadata API
INSTANCE_ID=$(curl -sf --connect-timeout 5 http://169.254.169.254/hetzner/v1/metadata/instance-id 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ]; then
    echo "ERROR: Could not retrieve instance ID from Hetzner metadata API" >&2
    echo "  This script must run on a Hetzner Cloud VPS" >&2
    exit 1
fi

# Read encryption salt
SALT_FILE="/opt/tamshai/.encryption-salt"
if [ ! -f "$SALT_FILE" ]; then
    echo "ERROR: Encryption salt not found at $SALT_FILE" >&2
    exit 1
fi

ENCRYPTION_SALT=$(cat "$SALT_FILE")

# Derive decryption key (same derivation as encrypt-secrets.sh)
DECRYPTION_KEY=$(echo -n "${INSTANCE_ID}${ENCRYPTION_SALT}" | sha256sum | cut -d' ' -f1)

# Parse encrypted file: IV:CIPHERTEXT
IFS=':' read -r IV CIPHERTEXT < "$ENCRYPTED_FILE"

if [ -z "$IV" ] || [ -z "$CIPHERTEXT" ]; then
    echo "ERROR: Invalid encrypted file format" >&2
    exit 1
fi

# Decrypt in memory
DECRYPTED=$(echo "$CIPHERTEXT" | openssl enc -aes-256-cbc -d \
    -K "$DECRYPTION_KEY" \
    -iv "$IV" \
    -base64 -A 2>/dev/null)

if [ -z "$DECRYPTED" ]; then
    echo "ERROR: Decryption failed - check encryption key derivation" >&2
    exit 1
fi

# Output as export statements (for sourcing)
# This ensures secrets go into environment variables, not files
echo "$DECRYPTED" | while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue

    # Output export statement
    echo "export $line"
done
