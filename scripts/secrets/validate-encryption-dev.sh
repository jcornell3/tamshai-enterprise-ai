#!/bin/bash
# =============================================================================
# Validate Encryption at Rest - Dev Environment
# =============================================================================
# Validates that encryption at rest is properly configured in the dev environment.
#
# Usage: ./validate-encryption-dev.sh
#
# Checks:
#   - .env.enc exists (encrypted secrets)
#   - .encryption-salt exists (encryption salt)
#   - gh CLI is authenticated (required for decryption)
#   - Decryption works correctly
#   - Plaintext .env status (warning during transition)
#
# Created: 2026-02-21
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

echo "=== Dev Encryption Validation ==="
echo ""

PASS=0
FAIL=0
WARN=0

# Helper function for results
pass() {
    echo "[PASS] $1"
    ((PASS++))
}

fail() {
    echo "[FAIL] $1"
    ((FAIL++))
}

warn() {
    echo "[WARN] $1"
    ((WARN++))
}

# =============================================================================
# CHECK 1: Encrypted file exists
# =============================================================================

if [ -f "$DOCKER_DIR/.env.enc" ]; then
    ENC_SIZE=$(stat -c%s "$DOCKER_DIR/.env.enc" 2>/dev/null || stat -f%z "$DOCKER_DIR/.env.enc" 2>/dev/null || echo "0")
    if [ "$ENC_SIZE" -gt 100 ]; then
        pass ".env.enc exists (${ENC_SIZE} bytes)"
    else
        fail ".env.enc exists but is too small (${ENC_SIZE} bytes)"
    fi
else
    fail ".env.enc not found"
fi

# =============================================================================
# CHECK 2: Encryption salt exists
# =============================================================================

if [ -f "$DOCKER_DIR/.encryption-salt" ]; then
    SALT_SIZE=$(stat -c%s "$DOCKER_DIR/.encryption-salt" 2>/dev/null || stat -f%z "$DOCKER_DIR/.encryption-salt" 2>/dev/null || echo "0")
    if [ "$SALT_SIZE" -ge 32 ]; then
        pass ".encryption-salt exists (${SALT_SIZE} bytes)"
    else
        fail ".encryption-salt exists but is too short (${SALT_SIZE} bytes, expected 32+)"
    fi
else
    fail ".encryption-salt not found"
fi

# =============================================================================
# CHECK 3: gh CLI authenticated
# =============================================================================

if command -v gh &>/dev/null; then
    GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
    if [ -n "$GITHUB_USER" ]; then
        pass "gh CLI authenticated as '$GITHUB_USER'"
    else
        fail "gh CLI not authenticated (run 'gh auth login')"
    fi
else
    fail "gh CLI not installed"
fi

# =============================================================================
# CHECK 4: Decryption works
# =============================================================================

if [ -f "$DOCKER_DIR/.env.enc" ] && [ -f "$DOCKER_DIR/.encryption-salt" ]; then
    DECRYPT_OUTPUT=$("$SCRIPT_DIR/decrypt-secrets-dev.sh" 2>&1) || true

    if echo "$DECRYPT_OUTPUT" | grep -q "ERROR:"; then
        fail "Decryption failed: $(echo "$DECRYPT_OUTPUT" | head -1)"
    elif [ -n "$DECRYPT_OUTPUT" ]; then
        # Count lines that look like env vars (NAME=value)
        ENV_VARS=$(echo "$DECRYPT_OUTPUT" | grep -c "^[A-Z_]*=" || echo "0")
        if [ "$ENV_VARS" -gt 10 ]; then
            pass "Decryption successful ($ENV_VARS environment variables)"
        else
            warn "Decryption returned $ENV_VARS variables (expected more)"
        fi
    else
        fail "Decryption returned empty output"
    fi
else
    warn "Skipping decryption test (missing files)"
fi

# =============================================================================
# CHECK 5: Plaintext .env status
# =============================================================================

if [ -f "$DOCKER_DIR/.env" ]; then
    warn "Plaintext .env exists (acceptable during transition)"
    echo "       To remove: rm $DOCKER_DIR/.env"
else
    pass "No plaintext .env (good security practice)"
fi

# =============================================================================
# CHECK 6: .gitignore includes encryption files
# =============================================================================

if [ -f "$DOCKER_DIR/.gitignore" ]; then
    GITIGNORE_OK=true
    for file in ".env" ".env.enc" ".encryption-salt"; do
        if ! grep -q "^${file}$" "$DOCKER_DIR/.gitignore" 2>/dev/null; then
            GITIGNORE_OK=false
        fi
    done
    if [ "$GITIGNORE_OK" = true ]; then
        pass ".gitignore includes encryption files"
    else
        warn ".gitignore missing some encryption files"
    fi
else
    warn ".gitignore not found in docker directory"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "=== Summary ==="
echo "  Passed:   $PASS"
echo "  Failed:   $FAIL"
echo "  Warnings: $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "Status: FAILED"
    echo "  Run 'terraform apply' to fix encryption issues"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "Status: PASSED with warnings"
    exit 0
else
    echo "Status: PASSED"
    exit 0
fi
