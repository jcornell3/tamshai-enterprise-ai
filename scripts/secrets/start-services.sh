#!/bin/bash
# =============================================================================
# Tamshai Enterprise AI - Secure Service Startup
# =============================================================================
# This script decrypts secrets in memory and starts Docker services.
# Secrets are NEVER written to disk - they exist only in RAM.
#
# Usage: ./start-services.sh
#
# Prerequisites:
#   - /opt/tamshai/.env.enc (encrypted secrets blob)
#   - /opt/tamshai/.encryption-salt (encryption salt)
#   - Hetzner metadata API accessible (for instance ID)
#   - DISCORD_WEBHOOK_URL (optional, for notifications)
#
# =============================================================================

set -euo pipefail

TAMSHAI_ROOT="${TAMSHAI_ROOT:-/opt/tamshai}"
DOCKER_DIR="$TAMSHAI_ROOT/infrastructure/docker"
SCRIPTS_DIR="$TAMSHAI_ROOT/scripts/secrets"

# =============================================================================
# Discord Notification Function
# =============================================================================
send_discord_notification() {
    local title="$1"
    local description="$2"
    local color="$3"  # Decimal: red=16711680, green=65280, yellow=16776960

    # Get webhook URL from environment or file
    local webhook_url="${DISCORD_WEBHOOK_URL:-}"
    if [ -z "$webhook_url" ] && [ -f "$TAMSHAI_ROOT/.discord-webhook" ]; then
        webhook_url=$(cat "$TAMSHAI_ROOT/.discord-webhook")
    fi

    if [ -z "$webhook_url" ]; then
        echo "[INFO] No Discord webhook configured, skipping notification"
        return 0
    fi

    # Get instance info for context
    local instance_id
    instance_id=$(curl -sf --connect-timeout 2 http://169.254.169.254/hetzner/v1/metadata/instance-id 2>/dev/null || echo "unknown")

    local payload
    payload=$(cat <<EOF
{
    "embeds": [{
        "title": "$title",
        "description": "$description",
        "color": $color,
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "footer": {"text": "VPS Instance: $instance_id"}
    }]
}
EOF
)

    curl -sf -X POST "$webhook_url" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null 2>&1 || echo "[WARN] Failed to send Discord notification"
}

echo "=== Tamshai Secure Startup $(date) ==="

# Verify we're in the right place
if [ ! -d "$DOCKER_DIR" ]; then
    echo "ERROR: Docker directory not found at $DOCKER_DIR"
    send_discord_notification \
        "🚨 Startup Failed" \
        "**Error:** Docker directory not found at $DOCKER_DIR\n**Action:** Check VPS deployment" \
        16711680
    exit 1
fi

# Decrypt secrets into environment (in memory only)
echo "Decrypting secrets..."
if [ -f "$TAMSHAI_ROOT/.env.enc" ]; then
    # shellcheck disable=SC1090
    eval "$("$SCRIPTS_DIR/decrypt-secrets.sh" "$TAMSHAI_ROOT/.env.enc")"
    echo "  Secrets loaded from encrypted file"
else
    # Fallback: Check for legacy .env file (should not exist in production)
    if [ -f "$TAMSHAI_ROOT/.env" ]; then
        echo "  WARNING: Using legacy plaintext .env file"
        echo "  This is a security risk - migrate to encrypted secrets"
        set -a
        # shellcheck disable=SC1091
        source "$TAMSHAI_ROOT/.env"
        set +a
    else
        echo "ERROR: No secrets file found (.env.enc or .env)"
        send_discord_notification \
            "🚨 Startup Failed - No Secrets" \
            "**Error:** No secrets file found (.env.enc or .env)\n**Action:** Check encryption deployment" \
            16711680
        exit 1
    fi
fi

# Verify critical secrets are loaded
REQUIRED_SECRETS=(
    "KEYCLOAK_ADMIN_PASSWORD"
    "POSTGRES_PASSWORD"
    "MCP_GATEWAY_CLIENT_SECRET"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret:-}" ]; then
        echo "ERROR: Required secret '$secret' not loaded"
        send_discord_notification \
            "🚨 Decryption Failed" \
            "**Error:** Required secret '$secret' not loaded\n**Cause:** Decryption may have failed or secret missing from encrypted blob\n**Action:** Check encryption key derivation" \
            16711680
        exit 1
    fi
done
echo "  All required secrets verified"

# Create temporary env file in RAM-backed tmpfs
# /dev/shm is guaranteed to be RAM-backed on Linux
TEMP_ENV=$(mktemp -p /dev/shm tamshai-env.XXXXXX)

# Ensure cleanup on exit
cleanup() {
    rm -f "$TEMP_ENV" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Export environment variables to temp file
# Only export known safe prefixes
echo "Creating temporary env file in RAM..."
env | grep -E '^(POSTGRES_|KEYCLOAK_|MONGODB_|REDIS_|CLAUDE_|MCP_|JWT_|ELASTIC_|MINIO_|VAULT_|E2E_|TEST_|PORT_|VITE_|LOG_|COMPOSE_|CADDYFILE|ENVIRONMENT|DOMAIN|SUPPORT_|ENABLE_|USER_|STAGE_|CUSTOMER_)' > "$TEMP_ENV"

# Verify temp file is on RAM
if [[ "$TEMP_ENV" != /dev/shm/* ]]; then
    echo "WARNING: Temp file is not on /dev/shm - secrets may be on disk!"
fi

# Change to docker directory
cd "$DOCKER_DIR"

# Start services with the RAM-based env file
echo "Starting Docker services..."
docker compose --env-file "$TEMP_ENV" up -d

# Wait for services to start
echo "Waiting for services to initialize..."
sleep 5

# Check service health
echo "Checking service health..."
RUNNING=$(docker compose ps --format '{{.Name}}: {{.Status}}' | grep -c "Up" || echo "0")
TOTAL=$(docker compose ps --format '{{.Name}}' | wc -l)

echo "  $RUNNING/$TOTAL services running"

# Remove the temp file explicitly (trap will also do this)
rm -f "$TEMP_ENV"

echo "=== Startup complete ==="
echo ""
echo "Services started with in-memory secrets."
echo "No plaintext secrets written to disk."

# Send success notification
send_discord_notification \
    "✅ Stage Services Started" \
    "**Services:** $RUNNING/$TOTAL running\n**Secrets:** Decrypted in-memory (C2 secure)\n**Status:** All critical secrets verified" \
    65280
