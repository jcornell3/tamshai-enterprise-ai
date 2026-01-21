#!/bin/bash
# =============================================================================
# GCP Health Check Library
# =============================================================================
#
# Functions for checking health of GCP services (Cloud Run, Cloud SQL, etc.)
# Used by Phoenix rebuild to ensure services are ready before proceeding.
#
# Usage:
#   source /path/to/scripts/gcp/lib/health-checks.sh
#   wait_for_service "mcp-gateway" 300
#   wait_for_keycloak 60
#
# Requirements:
#   - gcloud CLI authenticated
#   - curl available
#   - GCP_REGION environment variable set (required)
#
# =============================================================================

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_health_info() { echo -e "${BLUE}[health]${NC} $1"; }
log_health_success() { echo -e "${GREEN}[health]${NC} $1"; }
log_health_warn() { echo -e "${YELLOW}[health]${NC} $1"; }
log_health_error() { echo -e "${RED}[health]${NC} $1"; }

# Default values
DEFAULT_TIMEOUT=300
DEFAULT_INTERVAL=10
GCP_REGION="${GCP_REGION:-us-central1}"

# Cloud Run services to check
# Issue #28: MCP suite services require authentication (only accessible via mcp-gateway)
# Split into public (can health-check directly) and authenticated (check via gcloud)
CLOUD_RUN_SERVICES_PUBLIC=(
    "mcp-gateway"
    "keycloak"
    "web-portal"
)

# Authenticated services - skip direct health check, verify via gcloud status
CLOUD_RUN_SERVICES_AUTHENTICATED=(
    "mcp-hr"
    "mcp-finance"
    "mcp-sales"
    "mcp-support"
)

# All services for reference
CLOUD_RUN_SERVICES=(
    "mcp-gateway"
    "mcp-hr"
    "mcp-finance"
    "mcp-sales"
    "mcp-support"
    "keycloak"
    "web-portal"
)

# Get Cloud Run service URL
get_service_url() {
    local service_name="$1"
    local region="${GCP_REGION}"

    gcloud run services describe "$service_name" \
        --region="$region" \
        --format="value(status.url)" 2>/dev/null || echo ""
}

# Check if a URL is healthy (returns HTTP 2xx)
# Issue #33: Accept any 2xx status code (not just 200) to handle web-portal and other services
check_url_health() {
    local url="$1"
    local endpoint="${2:-/health}"

    if [ -z "$url" ]; then
        return 1
    fi

    local full_url="${url}${endpoint}"
    local http_code

    # Use -L to follow redirects, capture final status code
    http_code=$(curl -sL -o /dev/null -w "%{http_code}" "$full_url" 2>/dev/null) || http_code="000"

    # Accept any 2xx status code as healthy
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        return 0
    fi

    return 1
}

# Wait for a Cloud Run service to be healthy
# Usage: wait_for_service "service-name" [timeout_seconds] [health_endpoint]
wait_for_service() {
    local service_name="$1"
    local timeout="${2:-$DEFAULT_TIMEOUT}"
    local endpoint="${3:-/health}"

    log_health_info "Waiting for $service_name to be healthy (timeout: ${timeout}s)..."

    local start_time
    start_time=$(date +%s)
    local elapsed=0

    while [ $elapsed -lt "$timeout" ]; do
        local url
        url=$(get_service_url "$service_name")

        if [ -n "$url" ]; then
            if check_url_health "$url" "$endpoint"; then
                log_health_success "$service_name is healthy at $url"
                return 0
            fi
        fi

        local current_time
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))

        local remaining=$((timeout - elapsed))
        log_health_info "  $service_name not ready yet, retrying... (${remaining}s remaining)"
        sleep "$DEFAULT_INTERVAL"
    done

    log_health_error "$service_name did not become healthy within ${timeout}s"
    return 1
}

# Wait for Keycloak to be fully ready
# Checks both master realm and tamshai-corp realm
wait_for_keycloak() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"

    log_health_info "Waiting for Keycloak to be fully ready (timeout: ${timeout}s)..."

    local url
    url=$(get_service_url "keycloak")

    if [ -z "$url" ]; then
        # Try auth.tamshai.com as fallback
        url="https://auth.tamshai.com"
    fi

    local start_time
    start_time=$(date +%s)
    local elapsed=0

    while [ $elapsed -lt "$timeout" ]; do
        # Check master realm first
        if curl -sf "${url}/auth/realms/master/.well-known/openid-configuration" > /dev/null 2>&1; then
            log_health_info "  Master realm is available"

            # Now check tamshai-corp realm
            if curl -sf "${url}/auth/realms/tamshai-corp/.well-known/openid-configuration" > /dev/null 2>&1; then
                log_health_success "Keycloak is fully ready (both realms available)"
                return 0
            else
                log_health_info "  Waiting for tamshai-corp realm..."
            fi
        fi

        local current_time
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))

        local remaining=$((timeout - elapsed))
        log_health_info "  Keycloak not ready yet, retrying... (${remaining}s remaining)"
        sleep "$DEFAULT_INTERVAL"
    done

    log_health_error "Keycloak did not become fully ready within ${timeout}s"
    return 1
}

# Wait for Cloud SQL to accept connections
wait_for_cloudsql() {
    local instance_name="${1:-tamshai-prod-postgres}"
    local timeout="${2:-$DEFAULT_TIMEOUT}"

    log_health_info "Waiting for Cloud SQL instance $instance_name (timeout: ${timeout}s)..."

    local start_time
    start_time=$(date +%s)
    local elapsed=0

    while [ $elapsed -lt "$timeout" ]; do
        local state
        state=$(gcloud sql instances describe "$instance_name" \
            --format="value(state)" 2>/dev/null) || state=""

        if [ "$state" = "RUNNABLE" ]; then
            log_health_success "Cloud SQL instance $instance_name is RUNNABLE"
            return 0
        fi

        local current_time
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))

        local remaining=$((timeout - elapsed))
        log_health_info "  Cloud SQL state: ${state:-unknown}, waiting... (${remaining}s remaining)"
        sleep "$DEFAULT_INTERVAL"
    done

    log_health_error "Cloud SQL $instance_name did not become RUNNABLE within ${timeout}s"
    return 1
}

# Wait for all MCP services to be healthy
# Issue #28: MCP suite services require authentication, check via gcloud status
wait_for_mcp_suite() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"

    log_health_info "Waiting for MCP suite services (auth-protected)..."

    local failed=0

    for service in "${CLOUD_RUN_SERVICES_AUTHENTICATED[@]}"; do
        log_health_info "Checking $service via gcloud..."
        local status
        status=$(gcloud run services describe "$service" \
            --region="${GCP_REGION}" \
            --format="value(status.conditions[0].status)" 2>/dev/null) || status=""

        if [ "$status" = "True" ]; then
            log_health_success "  $service: Ready"
        else
            log_health_error "  $service: Not Ready (status: ${status:-unknown})"
            failed=$((failed + 1))
        fi
    done

    if [ $failed -gt 0 ]; then
        log_health_error "$failed MCP services failed health check"
        return 1
    fi

    log_health_success "All MCP suite services are healthy"
    return 0
}

# Wait for all Cloud Run services
# Issue #28: Split into public (HTTP check) and authenticated (gcloud status check)
wait_for_all_services() {
    local timeout="${1:-$DEFAULT_TIMEOUT}"

    log_health_info "Waiting for all Cloud Run services..."

    local failed=0

    # Check public services via HTTP
    for service in "${CLOUD_RUN_SERVICES_PUBLIC[@]}"; do
        local endpoint="/health"

        # Special handling for Keycloak
        if [ "$service" = "keycloak" ]; then
            if ! wait_for_keycloak "$timeout"; then
                failed=$((failed + 1))
            fi
            continue
        fi

        # Special handling for web-portal
        if [ "$service" = "web-portal" ]; then
            endpoint="/"
        fi

        if ! wait_for_service "$service" "$timeout" "$endpoint"; then
            failed=$((failed + 1))
        fi
    done

    # Check authenticated services via gcloud (can't HTTP health-check them)
    # These require authentication, so we just verify they're Ready via gcloud
    for service in "${CLOUD_RUN_SERVICES_AUTHENTICATED[@]}"; do
        log_health_info "Checking $service via gcloud (requires auth)..."
        local status
        status=$(gcloud run services describe "$service" \
            --region="${GCP_REGION}" \
            --format="value(status.conditions[0].status)" 2>/dev/null) || status=""

        if [ "$status" = "True" ]; then
            log_health_success "  $service: Ready (auth-protected)"
        else
            log_health_error "  $service: Not Ready (status: ${status:-unknown})"
            failed=$((failed + 1))
        fi
    done

    if [ $failed -gt 0 ]; then
        log_health_error "$failed services failed health check"
        return 1
    fi

    log_health_success "All Cloud Run services are healthy"
    return 0
}

# Quick health check (non-blocking)
quick_health_check() {
    log_health_info "Running quick health check..."

    local healthy=0
    local unhealthy=0

    for service in "${CLOUD_RUN_SERVICES[@]}"; do
        local url
        url=$(get_service_url "$service")

        if [ -z "$url" ]; then
            log_health_warn "  $service: No URL found"
            unhealthy=$((unhealthy + 1))
            continue
        fi

        local endpoint="/health"
        [ "$service" = "web-portal" ] && endpoint="/"

        if check_url_health "$url" "$endpoint"; then
            log_health_success "  $service: healthy"
            healthy=$((healthy + 1))
        else
            log_health_error "  $service: unhealthy"
            unhealthy=$((unhealthy + 1))
        fi
    done

    echo ""
    log_health_info "Summary: $healthy healthy, $unhealthy unhealthy"

    if [ $unhealthy -gt 0 ]; then
        return 1
    fi

    return 0
}

# Print service URLs and status
print_service_status() {
    log_health_info "Cloud Run Service Status"
    echo ""
    printf "%-15s %-50s %s\n" "SERVICE" "URL" "STATUS"
    printf "%s\n" "$(printf '%.0s-' {1..80})"

    for service in "${CLOUD_RUN_SERVICES[@]}"; do
        local url
        url=$(get_service_url "$service")

        local status="NO URL"
        if [ -n "$url" ]; then
            local endpoint="/health"
            [ "$service" = "web-portal" ] && endpoint="/"

            if check_url_health "$url" "$endpoint"; then
                status="${GREEN}HEALTHY${NC}"
            else
                status="${RED}UNHEALTHY${NC}"
            fi
        fi

        printf "%-15s %-50s %b\n" "$service" "${url:-N/A}" "$status"
    done

    echo ""
}

# Check VPC connector status
check_vpc_connector() {
    local connector_name="${1:-tamshai-prod-connector}"
    local region="${GCP_REGION}"

    log_health_info "Checking VPC connector: $connector_name"

    local state
    state=$(gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$region" \
        --format="value(state)" 2>/dev/null) || state=""

    if [ "$state" = "READY" ]; then
        log_health_success "VPC connector $connector_name is READY"
        return 0
    else
        log_health_error "VPC connector $connector_name state: ${state:-unknown}"
        return 1
    fi
}

# =============================================================================
# Issue #25: Cloud Build with VPC-SC support
# =============================================================================
# When VPC-SC blocks log streaming, gcloud builds submit returns non-zero
# even though the build is running. Use --async and poll for actual status.

# Submit a Cloud Build and wait for it to complete
# Returns 0 if build succeeds, 1 if it fails
# Usage: submit_and_wait_build <context_path> <--tag=xxx or --config=xxx>
submit_and_wait_build() {
    local context_path="$1"
    shift
    local build_args=("$@")
    local timeout="${CLOUD_BUILD_TIMEOUT:-600}"  # 10 minutes default

    # Submit build asynchronously
    local build_output
    build_output=$(gcloud builds submit "$context_path" "${build_args[@]}" --async --format="value(id)" 2>&1)
    local submit_exit_code=$?

    # Extract build ID from output
    local build_id
    build_id=$(echo "$build_output" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

    if [ -z "$build_id" ]; then
        log_health_error "Failed to submit build: $build_output"
        return 1
    fi

    log_health_info "Build submitted: $build_id"

    # Poll for completion
    local start_time
    start_time=$(date +%s)
    local elapsed=0

    while [ $elapsed -lt "$timeout" ]; do
        local status
        status=$(gcloud builds describe "$build_id" --region=global --format="value(status)" 2>/dev/null) || status=""

        case "$status" in
            SUCCESS)
                log_health_success "Build $build_id completed successfully"
                return 0
                ;;
            FAILURE|INTERNAL_ERROR|TIMEOUT|CANCELLED)
                log_health_error "Build $build_id failed with status: $status"
                return 1
                ;;
            QUEUED|WORKING)
                # Still running, continue waiting
                ;;
            *)
                log_health_warn "Build $build_id has unknown status: $status"
                ;;
        esac

        local current_time
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))

        local remaining=$((timeout - elapsed))
        if [ $((elapsed % 30)) -eq 0 ]; then
            log_health_info "Build $build_id status: $status (${remaining}s remaining)"
        fi
        sleep 5
    done

    log_health_error "Build $build_id timed out after ${timeout}s"
    return 1
}

echo "[health-checks] Library loaded"
