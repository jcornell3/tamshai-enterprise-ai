#!/bin/bash
# =============================================================================
# Tamshai Stage Monitor - Main Loop
# =============================================================================
# Monitors remote stage environment via HTTP health checks.
# Sends alerts to Discord on failures and recovery.
# =============================================================================

set -euo pipefail

# Configuration with defaults
TARGET_URL="${MONITOR_TARGET_URL:-https://www.tamshai.com}"
INTERVAL="${MONITOR_INTERVAL_SECONDS:-60}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"
FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-3}"
RECOVERY_NOTIFY="${RECOVERY_NOTIFY:-true}"

# Endpoints to check (comma-separated)
IFS=',' read -ra ENDPOINTS <<< "${CHECK_ENDPOINTS:-/api/health,/auth/realms/tamshai-corp}"

# State file for tracking failures
STATE_FILE="/data/monitor_state.json"
LAST_CHECK_FILE="/data/last_check.json"

# Initialize state if not exists
if [ ! -f "$STATE_FILE" ]; then
    echo '{"consecutive_failures":0,"last_status":"unknown","last_alert_time":0}' > "$STATE_FILE"
fi

# =============================================================================
# Discord Notification Functions
# =============================================================================

send_discord_alert() {
    local title="$1"
    local description="$2"
    local color="$3"  # Decimal color: red=16711680, green=65280, yellow=16776960

    if [ -z "$DISCORD_WEBHOOK" ]; then
        echo "[WARN] No Discord webhook configured, skipping notification"
        return 0
    fi

    local payload=$(cat <<EOF
{
    "embeds": [{
        "title": "$title",
        "description": "$description",
        "color": $color,
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "footer": {"text": "Tamshai Stage Monitor"}
    }]
}
EOF
)

    curl -sf -X POST "$DISCORD_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "$payload" || echo "[ERROR] Failed to send Discord notification"
}

send_failure_alert() {
    local endpoint="$1"
    local status="$2"
    local failures="$3"

    send_discord_alert \
        "🚨 Stage Health Check Failed" \
        "**Endpoint:** \`${TARGET_URL}${endpoint}\`\n**Status:** ${status}\n**Consecutive Failures:** ${failures}/${FAILURE_THRESHOLD}\n\n⚠️ Investigate immediately if this persists." \
        16711680  # Red
}

send_recovery_alert() {
    local endpoint="$1"

    send_discord_alert \
        "✅ Stage Environment Recovered" \
        "**Endpoint:** \`${TARGET_URL}${endpoint}\`\n**Status:** Healthy\n\nServices are responding normally." \
        65280  # Green
}

# =============================================================================
# Health Check Functions
# =============================================================================
#
# Vault Health Check Notes:
# - Vault returns HTTP 503 when sealed (treated as failure)
# - Vault returns HTTP 200 when unsealed and healthy
# - After Phoenix rebuild, Vault may need re-initialization
# - The deploy workflow auto-unseals using stored keys (C1 Security)
#
# =============================================================================

check_endpoint() {
    local endpoint="$1"
    local url="${TARGET_URL}${endpoint}"
    local timeout=10

    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time 30 "$url" 2>/dev/null || echo "000")

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        echo "ok"
    else
        echo "fail:$http_code"
    fi
}

check_all_endpoints() {
    local all_ok=true
    local results=()

    for endpoint in "${ENDPOINTS[@]}"; do
        local result
        result=$(check_endpoint "$endpoint")
        results+=("$endpoint:$result")

        if [[ "$result" != "ok" ]]; then
            all_ok=false
        fi
    done

    if $all_ok; then
        echo "ok"
    else
        echo "fail:${results[*]}"
    fi
}

# =============================================================================
# State Management
# =============================================================================

get_state() {
    local key="$1"
    jq -r ".$key" "$STATE_FILE"
}

set_state() {
    local key="$1"
    local value="$2"
    local tmp=$(mktemp)
    jq ".$key = $value" "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

# =============================================================================
# Main Loop
# =============================================================================

echo "========================================"
echo "Tamshai Stage Monitor Starting"
echo "========================================"
echo "Target: $TARGET_URL"
echo "Interval: ${INTERVAL}s"
echo "Endpoints: ${ENDPOINTS[*]}"
echo "Failure Threshold: $FAILURE_THRESHOLD"
echo "Discord Webhook: ${DISCORD_WEBHOOK:+configured}"
echo "========================================"

# Send startup notification
send_discord_alert \
    "🔍 Stage Monitor Started" \
    "**Target:** ${TARGET_URL}\n**Check Interval:** ${INTERVAL}s\n**Endpoints:** ${#ENDPOINTS[@]}" \
    16776960  # Yellow

while true; do
    echo "[$(date)] Checking health..."

    result=$(check_all_endpoints)
    current_failures=$(get_state "consecutive_failures")
    last_status=$(get_state "last_status")

    if [[ "$result" == "ok" ]]; then
        echo "[$(date)] ✓ All endpoints healthy"

        # Was previously failing? Send recovery notification
        if [[ "$last_status" == "failing" ]] && [[ "$RECOVERY_NOTIFY" == "true" ]]; then
            send_recovery_alert "all"
        fi

        set_state "consecutive_failures" "0"
        set_state "last_status" '"healthy"'
    else
        current_failures=$((current_failures + 1))
        echo "[$(date)] ✗ Health check failed ($current_failures/$FAILURE_THRESHOLD): $result"

        set_state "consecutive_failures" "$current_failures"

        # Reached threshold? Alert!
        if [ "$current_failures" -ge "$FAILURE_THRESHOLD" ]; then
            if [[ "$last_status" != "failing" ]]; then
                echo "[$(date)] 🚨 Threshold reached, sending alert"
                send_failure_alert "/" "$result" "$current_failures"
                set_state "last_status" '"failing"'
                set_state "last_alert_time" "$(date +%s)"
            fi
        fi
    fi

    # Write last check for healthcheck
    echo "{\"timestamp\":$(date +%s),\"result\":\"$result\"}" > "$LAST_CHECK_FILE"

    sleep "$INTERVAL"
done
