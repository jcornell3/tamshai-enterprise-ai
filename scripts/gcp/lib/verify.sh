#!/bin/bash
# Phoenix Rebuild - Verification Functions
# These functions verify resources are properly destroyed/created

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

# Required environment variables - no defaults for sensitive values
: "${GCP_REGION:?ERROR: GCP_REGION environment variable must be set}"
: "${GCP_PROJECT:?ERROR: GCP_PROJECT environment variable must be set}"

REGION="$GCP_REGION"
PROJECT="$GCP_PROJECT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# POST-DESTROY VERIFICATION (Gap #1a)
# =============================================================================

verify_no_cloud_run_services() {
    log_info "Checking for orphaned Cloud Run services..."
    local services
    services=$(gcloud run services list --region="$REGION" --format="value(name)" 2>/dev/null | grep -E "^(keycloak|mcp-|web-portal)" || true)

    if [[ -n "$services" ]]; then
        log_error "Cloud Run services still exist:"
        echo "$services"
        return 1
    fi
    log_info "No orphaned Cloud Run services found"
    return 0
}

verify_no_cloud_run_jobs() {
    log_info "Checking for orphaned Cloud Run jobs..."
    local jobs
    jobs=$(gcloud run jobs list --region="$REGION" --format="value(name)" 2>/dev/null | grep -E "provision" || true)

    if [[ -n "$jobs" ]]; then
        log_error "Cloud Run jobs still exist:"
        echo "$jobs"
        return 1
    fi
    log_info "No orphaned Cloud Run jobs found"
    return 0
}

verify_no_cloud_sql() {
    log_info "Checking for orphaned Cloud SQL instances..."
    local instances
    instances=$(gcloud sql instances list --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -n "$instances" ]]; then
        log_error "Cloud SQL instances still exist:"
        echo "$instances"
        return 1
    fi
    log_info "No orphaned Cloud SQL instances found"
    return 0
}

verify_no_vpc() {
    log_info "Checking for orphaned VPC networks..."
    local vpcs
    vpcs=$(gcloud compute networks list --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -n "$vpcs" ]]; then
        log_error "VPC networks still exist:"
        echo "$vpcs"
        return 1
    fi
    log_info "No orphaned VPC networks found"
    return 0
}

verify_no_private_ip() {
    log_info "Checking for orphaned private IP addresses..."
    local ips
    ips=$(gcloud compute addresses list --global --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -n "$ips" ]]; then
        log_warn "Private IP addresses still exist (may need manual deletion):"
        echo "$ips"
        return 1
    fi
    log_info "No orphaned private IP addresses found"
    return 0
}

# Check for persisted secrets (warning only, not blocking)
check_persisted_secrets() {
    log_info "Checking for persisted secrets..."
    local secrets
    secrets=$(gcloud secrets list --format="value(name)" 2>/dev/null | grep -E "^(tamshai-prod-|mcp-hr-service)" || true)

    if [[ -n "$secrets" ]]; then
        log_warn "Secrets still exist (will be deleted in pre-apply):"
        echo "$secrets"
        return 0  # Warning only
    fi
    log_info "No persisted secrets found"
    return 0
}

# Check for persisted storage buckets (warning only)
check_persisted_buckets() {
    log_info "Checking for persisted storage buckets..."
    local buckets
    buckets=$(gcloud storage buckets list --format="value(name)" 2>/dev/null | grep -E "tamshai-prod-(logs|finance|public)" || true)

    if [[ -n "$buckets" ]]; then
        log_warn "Storage buckets still exist (may need import during apply):"
        echo "$buckets"
        return 0  # Warning only
    fi
    log_info "No persisted storage buckets found"
    return 0
}

# Main verification function - fails if critical resources exist
verify_destroy_complete() {
    log_info "=== Post-Destroy Verification ==="
    local errors=0

    verify_no_cloud_run_services || ((errors++))
    verify_no_cloud_run_jobs || ((errors++))
    verify_no_cloud_sql || ((errors++))
    verify_no_vpc || ((errors++))
    verify_no_private_ip || ((errors++))

    # These are warnings only
    check_persisted_secrets
    check_persisted_buckets

    if [[ $errors -gt 0 ]]; then
        log_error "Post-destroy verification FAILED: $errors critical resource type(s) still exist"
        return 1
    fi

    log_info "=== Post-Destroy Verification PASSED ==="
    return 0
}

# =============================================================================
# POST-DEPLOY VERIFICATION (Stage 8)
# =============================================================================

verify_cloud_run_services_healthy() {
    log_info "Verifying all Cloud Run services are healthy..."
    local unhealthy=0

    for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
        local status
        status=$(gcloud run services describe "$svc" --region="$REGION" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")

        if [[ "$status" == "True" ]]; then
            log_info "  $svc: healthy"
        else
            log_error "  $svc: $status"
            ((unhealthy++))
        fi
    done

    if [[ $unhealthy -gt 0 ]]; then
        log_error "$unhealthy service(s) not healthy"
        return 1
    fi

    log_info "All Cloud Run services healthy"
    return 0
}

verify_keycloak_reachable() {
    log_info "Verifying Keycloak is reachable via auth.tamshai.com..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration" 2>/dev/null || echo "000")

    if [[ "$response" == "200" ]]; then
        log_info "Keycloak reachable (HTTP 200)"
        return 0
    else
        log_error "Keycloak not reachable (HTTP $response)"
        return 1
    fi
}

verify_mcp_gateway_healthy() {
    log_info "Verifying MCP Gateway health endpoint..."
    local gateway_url
    gateway_url=$(gcloud run services describe mcp-gateway --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")

    if [[ -z "$gateway_url" ]]; then
        log_error "Could not get MCP Gateway URL"
        return 1
    fi

    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "${gateway_url}/health" 2>/dev/null || echo "000")

    if [[ "$response" == "200" ]]; then
        log_info "MCP Gateway healthy (HTTP 200)"
        return 0
    else
        log_error "MCP Gateway not healthy (HTTP $response)"
        return 1
    fi
}

# Main post-deploy verification
verify_deploy_complete() {
    log_info "=== Post-Deploy Verification ==="
    local errors=0

    verify_cloud_run_services_healthy || ((errors++))
    verify_keycloak_reachable || ((errors++))
    verify_mcp_gateway_healthy || ((errors++))

    if [[ $errors -gt 0 ]]; then
        log_error "Post-deploy verification FAILED: $errors check(s) failed"
        return 1
    fi

    log_info "=== Post-Deploy Verification PASSED ==="
    return 0
}
