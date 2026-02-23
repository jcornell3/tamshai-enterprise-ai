#!/bin/bash
# =============================================================================
# Validate Encryption at Rest - Stage Environment (VPS)
# =============================================================================
# Validates that encryption at rest is properly configured on the VPS.
#
# Usage: ./validate-encryption.sh
#
# Checks:
#   - .env.enc exists (encrypted secrets)
#   - .encryption-salt exists (encryption salt)
#   - Hetzner metadata API accessible (required for key derivation)
#   - Decryption works correctly
#   - Plaintext .env status (should NOT exist in production)
#
# Created: 2026-02-22
# =============================================================================

set -euo pipefail

TAMSHAI_ROOT="${TAMSHAI_ROOT:-/opt/tamshai}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Stage Encryption Validation ==="
echo ""

PASS=0
FAIL=0
WARN=0

# Helper function for results
pass() {
    echo "[PASS] $1"
    PASS=$((PASS + 1))
}

fail() {
    echo "[FAIL] $1"
    FAIL=$((FAIL + 1))
}

warn() {
    echo "[WARN] $1"
    WARN=$((WARN + 1))
}

# =============================================================================
# CHECK 1: Encrypted file exists
# =============================================================================

if [ -f "$TAMSHAI_ROOT/.env.enc" ]; then
    ENC_SIZE=$(stat -c%s "$TAMSHAI_ROOT/.env.enc" 2>/dev/null || stat -f%z "$TAMSHAI_ROOT/.env.enc" 2>/dev/null || echo "0")
    if [ "$ENC_SIZE" -gt 100 ]; then
        pass ".env.enc exists (${ENC_SIZE} bytes)"
    else
        fail ".env.enc exists but is too small (${ENC_SIZE} bytes)"
    fi
else
    fail ".env.enc not found at $TAMSHAI_ROOT/.env.enc"
fi

# =============================================================================
# CHECK 2: Encryption salt exists
# =============================================================================

if [ -f "$TAMSHAI_ROOT/.encryption-salt" ]; then
    SALT_SIZE=$(stat -c%s "$TAMSHAI_ROOT/.encryption-salt" 2>/dev/null || stat -f%z "$TAMSHAI_ROOT/.encryption-salt" 2>/dev/null || echo "0")
    if [ "$SALT_SIZE" -ge 32 ]; then
        pass ".encryption-salt exists (${SALT_SIZE} bytes)"
    else
        fail ".encryption-salt exists but is too short (${SALT_SIZE} bytes, expected 32+)"
    fi
else
    fail ".encryption-salt not found at $TAMSHAI_ROOT/.encryption-salt"
fi

# =============================================================================
# CHECK 3: Hetzner metadata API accessible
# =============================================================================

INSTANCE_ID=$(curl -sf --connect-timeout 5 http://169.254.169.254/hetzner/v1/metadata/instance-id 2>/dev/null || echo "")

if [ -n "$INSTANCE_ID" ]; then
    pass "Hetzner metadata API accessible (instance: $INSTANCE_ID)"
else
    # Check if we're running locally (not on VPS)
    if [ -f "/etc/machine-id" ]; then
        warn "Hetzner metadata API not accessible (not running on VPS?)"
        echo "       This check requires VPS environment"
    else
        fail "Hetzner metadata API not accessible"
    fi
fi

# =============================================================================
# CHECK 4: Decryption works
# =============================================================================

if [ -f "$TAMSHAI_ROOT/.env.enc" ] && [ -f "$TAMSHAI_ROOT/.encryption-salt" ] && [ -n "$INSTANCE_ID" ]; then
    DECRYPT_OUTPUT=$("$SCRIPT_DIR/decrypt-secrets.sh" "$TAMSHAI_ROOT/.env.enc" 2>&1) || true

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
elif [ -z "$INSTANCE_ID" ]; then
    warn "Skipping decryption test (not on VPS)"
else
    warn "Skipping decryption test (missing files)"
fi

# =============================================================================
# CHECK 5: Plaintext .env status
# =============================================================================

if [ -f "$TAMSHAI_ROOT/.env" ]; then
    fail "Plaintext .env exists (SECURITY RISK in production)"
    echo "       Remove with: rm $TAMSHAI_ROOT/.env"
elif [ -f "$TAMSHAI_ROOT/infrastructure/docker/.env" ]; then
    fail "Plaintext .env exists in docker directory (SECURITY RISK)"
    echo "       Remove with: rm $TAMSHAI_ROOT/infrastructure/docker/.env"
else
    pass "No plaintext .env (good security practice)"
fi

# =============================================================================
# CHECK 6: File permissions
# =============================================================================

if [ -f "$TAMSHAI_ROOT/.env.enc" ]; then
    PERMS=$(stat -c%a "$TAMSHAI_ROOT/.env.enc" 2>/dev/null || stat -f%Lp "$TAMSHAI_ROOT/.env.enc" 2>/dev/null || echo "unknown")
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "400" ]; then
        pass ".env.enc has restrictive permissions ($PERMS)"
    else
        warn ".env.enc permissions are $PERMS (expected 600 or 400)"
    fi
fi

if [ -f "$TAMSHAI_ROOT/.encryption-salt" ]; then
    PERMS=$(stat -c%a "$TAMSHAI_ROOT/.encryption-salt" 2>/dev/null || stat -f%Lp "$TAMSHAI_ROOT/.encryption-salt" 2>/dev/null || echo "unknown")
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "400" ]; then
        pass ".encryption-salt has restrictive permissions ($PERMS)"
    else
        warn ".encryption-salt permissions are $PERMS (expected 600 or 400)"
    fi
fi

# =============================================================================
# CHECK 7: Docker services using encrypted secrets
# =============================================================================

if command -v docker &>/dev/null; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "tamshai"; then
        RUNNING=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "tamshai" || echo "0")
        pass "$RUNNING Tamshai containers running"

        # Check if containers have critical env vars (without revealing values)
        GATEWAY=$(docker ps --format '{{.Names}}' 2>/dev/null | grep "mcp-gateway" | head -1 || echo "")
        if [ -n "$GATEWAY" ]; then
            HAS_SECRETS=$(docker exec "$GATEWAY" printenv 2>/dev/null | grep -c "^KEYCLOAK\|^POSTGRES\|^MCP_" || echo "0")
            if [ "$HAS_SECRETS" -gt 3 ]; then
                pass "MCP Gateway has decrypted secrets loaded"
            else
                warn "MCP Gateway may be missing some secrets"
            fi
        fi
    else
        warn "No Tamshai containers running"
    fi
else
    warn "Docker not available for container checks"
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
    echo "  Check encryption configuration and re-run cloud-init or terraform apply"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "Status: PASSED with warnings"
    exit 0
else
    echo "Status: PASSED"
    exit 0
fi
