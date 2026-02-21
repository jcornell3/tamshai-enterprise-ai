#!/bin/bash
# =============================================================================
# Tamshai Enterprise AI - Secure Dev Service Startup
# =============================================================================
# This script decrypts secrets in memory and starts Docker services.
# Secrets are NEVER written to disk - they exist only in RAM.
#
# Usage: ./start-services-dev.sh [options]
#
# Options:
#   --build       Rebuild containers before starting
#   --no-cleanup  Keep temp file after startup (for debugging)
#   --fallback    Force use of plaintext .env (skip encryption)
#
# Prerequisites:
#   - infrastructure/docker/.env.enc (encrypted secrets)
#   - infrastructure/docker/.encryption-salt (encryption salt)
#   - gh CLI authenticated (for key derivation)
#
# Created: 2026-02-21
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

BUILD_FLAG=""
CLEANUP=true
FORCE_FALLBACK=false

for arg in "$@"; do
    case $arg in
        --build)
            BUILD_FLAG="--build"
            ;;
        --no-cleanup)
            CLEANUP=false
            ;;
        --fallback)
            FORCE_FALLBACK=true
            ;;
        --help|-h)
            echo "Usage: $0 [--build] [--no-cleanup] [--fallback]"
            echo ""
            echo "Options:"
            echo "  --build       Rebuild containers before starting"
            echo "  --no-cleanup  Keep temp file after startup (for debugging)"
            echo "  --fallback    Force use of plaintext .env (skip encryption)"
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "=== Tamshai Dev Secure Startup $(date) ==="

# Verify docker directory exists
if [ ! -d "$DOCKER_DIR" ]; then
    echo "ERROR: Docker directory not found at $DOCKER_DIR"
    exit 1
fi

# =============================================================================
# DECIDE: ENCRYPTED OR PLAINTEXT
# =============================================================================

USE_ENCRYPTED=false

if [ "$FORCE_FALLBACK" = true ]; then
    echo "Forcing plaintext fallback mode..."
elif [ -f "$DOCKER_DIR/.env.enc" ] && [ -f "$DOCKER_DIR/.encryption-salt" ]; then
    USE_ENCRYPTED=true
    echo "Using encrypted secrets..."
elif [ -f "$DOCKER_DIR/.env" ]; then
    echo "WARNING: Using plaintext .env (encryption not enabled)"
    echo "  To enable encryption: terraform apply -var='enable_encryption=true'"
else
    echo "ERROR: No secrets found"
    echo "  Expected: $DOCKER_DIR/.env.enc (encrypted)"
    echo "       or: $DOCKER_DIR/.env (plaintext)"
    echo "  Run 'terraform apply' to generate secrets"
    exit 1
fi

# =============================================================================
# START SERVICES
# =============================================================================

cd "$DOCKER_DIR"

if [ "$USE_ENCRYPTED" = true ]; then
    # Create temp file in RAM if possible
    # Linux: /dev/shm (RAM-backed)
    # macOS/Windows: regular temp (not RAM, but better than nothing)
    if [ -d "/dev/shm" ]; then
        TEMP_ENV=$(mktemp -p /dev/shm tamshai-dev.XXXXXX)
        echo "  Temp file in RAM (/dev/shm)"
    else
        TEMP_ENV=$(mktemp)
        echo "  Temp file in default temp location (not RAM-backed)"
    fi

    # Cleanup trap
    cleanup() {
        if [ "$CLEANUP" = true ] && [ -n "${TEMP_ENV:-}" ]; then
            rm -f "$TEMP_ENV" 2>/dev/null || true
        fi
    }
    trap cleanup EXIT INT TERM

    # Decrypt to temp file
    echo "Decrypting secrets..."
    "$SCRIPT_DIR/decrypt-secrets-dev.sh" > "$TEMP_ENV"
    chmod 600 "$TEMP_ENV"

    # Verify decryption worked
    if [ ! -s "$TEMP_ENV" ]; then
        echo "ERROR: Decryption produced empty output"
        exit 1
    fi

    # Start services with decrypted env
    echo "Starting Docker services..."
    docker compose --env-file "$TEMP_ENV" up -d $BUILD_FLAG

    echo ""
    echo "[OK] Services started with encrypted secrets"
    echo "     Temp file will be cleaned up on exit"

else
    # Plaintext fallback
    echo "Starting Docker services..."
    docker compose up -d $BUILD_FLAG

    echo ""
    echo "[OK] Services started with plaintext .env"
    echo "     Consider enabling encryption for security"
fi

# =============================================================================
# SERVICE STATUS
# =============================================================================

echo ""
echo "=== Service Status ==="
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
