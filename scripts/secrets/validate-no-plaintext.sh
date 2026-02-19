#!/bin/bash
# =============================================================================
# Validate No Plaintext Secrets on Disk
# =============================================================================
# Run on VPS after deployment to verify secrets are not on disk.
#
# Usage: ./validate-no-plaintext.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - Violations found
#
# =============================================================================

set -euo pipefail

echo "=== Checking for plaintext secrets on disk ==="
echo ""

VIOLATIONS=0

# Check for .env files (should not exist in plaintext)
echo "Checking for plaintext .env files..."
ENV_PATTERNS=(
    "/opt/tamshai/.env"
    "/opt/tamshai/infrastructure/docker/.env"
    "/tmp/tamshai.env"
    "/tmp/*.env"
)

for pattern in "${ENV_PATTERNS[@]}"; do
    # shellcheck disable=SC2086
    if ls $pattern 2>/dev/null | head -1 | grep -q .; then
        echo "  VIOLATION: Found plaintext env file matching: $pattern"
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        echo "  OK: No files matching: $pattern"
    fi
done
echo ""

# Check for known secret patterns in files (excluding encrypted files and git)
echo "Searching for secret patterns in files..."
SECRETS_PATTERNS="KEYCLOAK_ADMIN_PASSWORD=|POSTGRES_PASSWORD=|CLAUDE_API_KEY=|MCP_GATEWAY_CLIENT_SECRET=|MCP_HR_SERVICE_CLIENT_SECRET="

# Search in /opt/tamshai excluding .enc files and .git
if grep -r -l -E "$SECRETS_PATTERNS" /opt/tamshai \
    --exclude="*.enc" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude="*.sh" \
    --exclude="*.md" \
    --exclude="*.example" \
    2>/dev/null | head -5; then
    echo "  VIOLATION: Found potential plaintext secrets in files above"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "  OK: No plaintext secrets found in files"
fi
echo ""

# Verify encrypted file exists
echo "Checking for encrypted secrets file..."
if [ -f /opt/tamshai/.env.enc ]; then
    echo "  OK: Encrypted secrets file exists at /opt/tamshai/.env.enc"
else
    echo "  VIOLATION: Encrypted secrets file not found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo ""

# Check encryption salt exists
echo "Checking for encryption salt..."
if [ -f /opt/tamshai/.encryption-salt ]; then
    echo "  OK: Encryption salt exists at /opt/tamshai/.encryption-salt"
else
    echo "  VIOLATION: Encryption salt not found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo ""

# Check /dev/shm is available and RAM-backed
echo "Checking /dev/shm (RAM-backed tmpfs)..."
if mount | grep -q "/dev/shm.*tmpfs"; then
    echo "  OK: /dev/shm is RAM-backed tmpfs"
    # Check it's writable
    if touch /dev/shm/.test_write 2>/dev/null; then
        rm -f /dev/shm/.test_write
        echo "  OK: /dev/shm is writable"
    else
        echo "  WARNING: /dev/shm is not writable"
    fi
else
    echo "  WARNING: /dev/shm may not be RAM-backed"
fi
echo ""

# Check docker containers don't have .env files mounted
echo "Checking Docker container mounts..."
CONTAINER_ENV_MOUNTS=$(docker inspect --format='{{range .Mounts}}{{if or (eq .Destination "/.env") (eq .Destination "/app/.env")}}FOUND{{end}}{{end}}' $(docker ps -q) 2>/dev/null || echo "")
if [ -n "$CONTAINER_ENV_MOUNTS" ]; then
    echo "  WARNING: Some containers may have .env files mounted"
else
    echo "  OK: No .env file mounts detected in running containers"
fi
echo ""

# Summary
echo "=========================================="
if [ $VIOLATIONS -eq 0 ]; then
    echo "ALL CHECKS PASSED: No plaintext secrets on disk"
    echo "=========================================="
    exit 0
else
    echo "FAILED: $VIOLATIONS violation(s) found"
    echo "=========================================="
    exit 1
fi
