#!/bin/bash
# Phoenix Rebuild - Domain Mapping Functions
# Functions for managing Cloud Run domain mappings

set -euo pipefail

# Required environment variables
: "${GCP_REGION:?ERROR: GCP_REGION environment variable must be set}"
: "${GCP_PROJECT:?ERROR: GCP_PROJECT environment variable must be set}"

REGION="$GCP_REGION"
PROJECT="$GCP_PROJECT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# DOMAIN MAPPING FUNCTIONS (Gap #35, #36)
# =============================================================================

# Create domain mapping for a Cloud Run service
create_domain_mapping() {
    local domain="$1"
    local service="$2"

    log_info "Creating domain mapping: $domain -> $service"

    # Check if mapping already exists
    if gcloud beta run domain-mappings describe --domain="$domain" --region="$REGION" &>/dev/null; then
        log_info "Domain mapping already exists for $domain"
        return 0
    fi

    gcloud beta run domain-mappings create \
        --service="$service" \
        --domain="$domain" \
        --region="$REGION"

    log_info "Domain mapping created: $domain -> $service"
}

# Wait for domain mapping to be routable (Gap #16)
wait_for_domain_routable() {
    local domain="$1"
    local timeout="${2:-300}"  # Default 5 minutes
    local interval=10
    local elapsed=0

    log_info "Waiting for domain mapping to be routable: $domain (timeout: ${timeout}s)"

    while [[ $elapsed -lt $timeout ]]; do
        local status
        status=$(gcloud beta run domain-mappings describe \
            --domain="$domain" \
            --region="$REGION" \
            --format="value(status.conditions[2].status)" 2>/dev/null || echo "Unknown")

        if [[ "$status" == "True" ]]; then
            log_info "Domain mapping is routable: $domain"
            return 0
        fi

        log_info "  Waiting... (${elapsed}s elapsed, status: $status)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    log_error "Timeout waiting for domain mapping to be routable: $domain"
    return 1
}

# Check if domain is reachable via HTTPS
wait_for_domain_reachable() {
    local domain="$1"
    local path="${2:-/}"
    local timeout="${3:-300}"
    local interval=10
    local elapsed=0

    log_info "Waiting for domain to be HTTPS reachable: $domain (timeout: ${timeout}s)"

    while [[ $elapsed -lt $timeout ]]; do
        local http_code
        http_code=$(curl -sf -o /dev/null -w "%{http_code}" "https://${domain}${path}" 2>/dev/null || echo "000")

        if [[ "$http_code" =~ ^[23] ]]; then
            log_info "Domain is reachable: $domain (HTTP $http_code)"
            return 0
        fi

        log_info "  Waiting... (${elapsed}s elapsed, HTTP $http_code)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    log_error "Timeout waiting for domain to be reachable: $domain"
    return 1
}

# Create auth.tamshai.com domain mapping for Keycloak
create_auth_domain_mapping() {
    create_domain_mapping "auth.tamshai.com" "keycloak"
}

# Wait for auth.tamshai.com to be fully routable and reachable
wait_for_auth_domain() {
    local timeout="${1:-600}"  # Default 10 minutes

    wait_for_domain_routable "auth.tamshai.com" "$timeout" || return 1
    wait_for_domain_reachable "auth.tamshai.com" "/auth/realms/tamshai-corp/.well-known/openid-configuration" "$timeout" || return 1
}

# =============================================================================
# HTTPS CERTIFICATE VERIFICATION (Issue #8 Fix)
# =============================================================================
# GCP's domain mapping "Ready" status is misleading - it only means the domain
# mapping is configured, NOT that the SSL certificate is deployed.
#
# Certificate propagation timeline:
#   T+0:00  Domain mapping created → Status: "Pending"
#   T+0:30  DNS verified → Status: "Ready" (MISLEADING!)
#   T+5:00  Certificate issued
#   T+10:00 Certificate deployed to Cloud Run edge
#   T+15:00 Full propagation to all edge locations
#
# This function waits for the certificate to actually work via HTTPS.

# Wait for SSL certificate to be deployed and working
# This is the authoritative check - ignore GCP "Ready" status
wait_for_ssl_certificate() {
    local domain="$1"
    local path="${2:-/}"
    local timeout="${3:-900}"  # Default 15 minutes (certs can take 10-15 min)
    local interval=30          # Check every 30 seconds (cert deploys are slow)
    local elapsed=0

    log_info "Waiting for SSL certificate deployment: $domain"
    log_info "  Note: GCP 'Ready' status is NOT reliable for certificate readiness"
    log_info "  Timeout: ${timeout}s (~$((timeout / 60)) minutes)"
    log_info "  This is the authoritative HTTPS check."

    while [[ $elapsed -lt $timeout ]]; do
        # Direct HTTPS check - this is what matters
        local http_code
        http_code=$(curl -sf -o /dev/null -w "%{http_code}" "https://${domain}${path}" 2>/dev/null || echo "000")

        if [[ "$http_code" =~ ^[23] ]]; then
            log_info "SSL certificate deployed and working: $domain (HTTP $http_code)"
            return 0
        fi

        local elapsed_min=$((elapsed / 60))
        log_info "  Waiting for certificate... (${elapsed_min}m elapsed, HTTP $http_code)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    log_error "SSL certificate not ready after $((timeout / 60)) minutes: $domain"
    log_error "  This may be a temporary issue - try again in a few minutes"
    log_error "  Or check: https://console.cloud.google.com/run/domains?project=$PROJECT"
    return 1
}

# Wait for auth.tamshai.com with full certificate verification
wait_for_auth_domain_with_ssl() {
    local timeout="${1:-900}"  # Default 15 minutes for full cert deployment

    log_info "Waiting for auth.tamshai.com with SSL certificate verification..."

    # First check GCP status (fast check, informational only)
    wait_for_domain_routable "auth.tamshai.com" 60 || true  # Don't fail on this

    # The real check - wait for SSL to actually work
    wait_for_ssl_certificate "auth.tamshai.com" "/auth/realms/tamshai-corp/.well-known/openid-configuration" "$timeout"
}

# Delete domain mapping
delete_domain_mapping() {
    local domain="$1"

    log_info "Deleting domain mapping: $domain"

    if ! gcloud beta run domain-mappings describe --domain="$domain" --region="$REGION" &>/dev/null; then
        log_info "Domain mapping does not exist: $domain"
        return 0
    fi

    gcloud beta run domain-mappings delete --domain="$domain" --region="$REGION" --quiet
    log_info "Domain mapping deleted: $domain"
}
