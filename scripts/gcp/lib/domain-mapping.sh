#!/bin/bash
# =============================================================================
# GCP Domain Mapping Library
# =============================================================================
#
# Functions for managing Cloud Run domain mappings.
# Supports configurable domains for primary and DR environments.
#
# Usage:
#   source /path/to/scripts/gcp/lib/domain-mapping.sh
#   create_domain_mapping "auth.tamshai.com" "keycloak"
#   wait_for_ssl_certificate "auth-dr.tamshai.com" "/auth/realms/tamshai-corp/.well-known/openid-configuration"
#
# Required environment variables:
#   GCP_DR_REGION - DR target region (for DR scripts)
#   GCP_REGION    - Production region (for phoenix-rebuild.sh)
#   GCP_PROJECT   - GCP project ID
#
# SAFETY (Bug #20): GCP_DR_REGION takes priority over GCP_REGION.
#   - DR scripts set GCP_DR_REGION → uses DR region
#   - Production scripts set GCP_REGION → uses production region
#
# Optional configuration variables:
#   KEYCLOAK_DOMAIN - Keycloak domain (default: auth.tamshai.com)
#   KEYCLOAK_REALM  - Keycloak realm (default: tamshai-corp)
#
# Ref: Issue #102 - Unify prod and DR deployments
# =============================================================================

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

# Bug #20: Defer region check. GCP_DR_REGION takes priority over GCP_REGION.
REGION="${GCP_DR_REGION:-${GCP_REGION:-}}"
PROJECT="${GCP_PROJECT:-}"

# Validate at function call time, not source time
_ensure_domain_env() {
    if [[ -z "${GCP_DR_REGION:-}" && -z "${GCP_REGION:-}" ]]; then
        log_error "Either GCP_DR_REGION (DR) or GCP_REGION (prod) must be set"
        return 1
    fi
    if [[ -z "${GCP_PROJECT:-}" ]]; then
        log_error "GCP_PROJECT must be set"
        return 1
    fi
    REGION="${GCP_DR_REGION:-${GCP_REGION}}"
    PROJECT="$GCP_PROJECT"
}

# Configurable defaults (Issue #102)
KEYCLOAK_DOMAIN="${KEYCLOAK_DOMAIN:-auth.tamshai.com}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-tamshai-corp}"

# Colors for output (use common.sh if available, otherwise define locally)
if ! type log_info &>/dev/null; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'

    log_info() { echo -e "${GREEN}[domain]${NC} $1"; }
    log_warn() { echo -e "${YELLOW}[domain]${NC} $1"; }
    log_error() { echo -e "${RED}[domain]${NC} $1"; }
fi

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
        # Note: Do NOT use -f flag — it causes curl to exit non-zero on HTTP 4xx,
        # which triggers the || fallback and corrupts http_code (e.g., "401000").
        # HTTP 401/403 means SSL IS working (server responded after SSL handshake).
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://${domain}${path}" 2>/dev/null || echo "000")

        if [[ "$http_code" =~ ^[234] ]]; then
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

# Create auth domain mapping for Keycloak
# Usage: create_auth_domain_mapping [domain] [service_name]
#   domain: Keycloak domain (default: $KEYCLOAK_DOMAIN)
#   service_name: Cloud Run service name (default: keycloak)
create_auth_domain_mapping() {
    local domain="${1:-${KEYCLOAK_DOMAIN}}"
    local service="${2:-keycloak}"
    create_domain_mapping "$domain" "$service"
}

# Wait for auth domain to be fully routable and reachable
# Usage: wait_for_auth_domain [timeout] [domain] [realm]
#   timeout: Wait timeout in seconds (default: 600)
#   domain: Keycloak domain (default: $KEYCLOAK_DOMAIN)
#   realm: Keycloak realm (default: $KEYCLOAK_REALM)
wait_for_auth_domain() {
    local timeout="${1:-600}"  # Default 10 minutes
    local domain="${2:-${KEYCLOAK_DOMAIN}}"
    local realm="${3:-${KEYCLOAK_REALM}}"

    wait_for_domain_routable "$domain" "$timeout" || return 1
    wait_for_domain_reachable "$domain" "/auth/realms/${realm}/.well-known/openid-configuration" "$timeout" || return 1
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
    local timeout="${3:-1350}"  # Default 22.5 minutes (matches phoenix-rebuild.sh: 45×30s)
    local interval=30          # Check every 30 seconds (cert deploys are slow)
    local elapsed=0

    log_info "Waiting for SSL certificate deployment: $domain"
    log_info "  Note: GCP 'Ready' status is NOT reliable for certificate readiness"
    log_info "  Timeout: ${timeout}s (~$((timeout / 60)) minutes)"
    log_info "  This is the authoritative HTTPS check."

    while [[ $elapsed -lt $timeout ]]; do
        # Direct HTTPS check - this is what matters
        local http_code
        # Note: Do NOT use -f flag — it causes curl to exit non-zero on HTTP 4xx,
        # which triggers the || fallback and corrupts http_code (e.g., "401000").
        # HTTP 401/403 means SSL IS working (server responded after SSL handshake).
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://${domain}${path}" 2>/dev/null || echo "000")

        if [[ "$http_code" =~ ^[234] ]]; then
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

# Wait for auth domain with full certificate verification
# Usage: wait_for_auth_domain_with_ssl [timeout] [domain] [realm]
#   timeout: Wait timeout in seconds (default: 1350 = 22.5 minutes)
#   domain: Keycloak domain (default: $KEYCLOAK_DOMAIN)
#   realm: Keycloak realm (default: $KEYCLOAK_REALM)
wait_for_auth_domain_with_ssl() {
    local timeout="${1:-1350}"  # Default 22.5 minutes (matches phoenix-rebuild.sh)
    local domain="${2:-${KEYCLOAK_DOMAIN}}"
    local realm="${3:-${KEYCLOAK_REALM}}"

    log_info "Waiting for ${domain} with SSL certificate verification..."

    # First check GCP status (fast check, informational only)
    wait_for_domain_routable "$domain" 60 || true  # Don't fail on this

    # The real check - wait for SSL to actually work
    wait_for_ssl_certificate "$domain" "/auth/realms/${realm}/.well-known/openid-configuration" "$timeout"
}

# =============================================================================
# MULTI-DOMAIN SSL VERIFICATION (Issue #102 Phoenix Rebuild Lesson)
# =============================================================================
# After Phoenix rebuild, E2E tests failed with HTTP 525 (SSL handshake failed)
# because SSL was only verified for auth domain, not app or api domains.
#
# This function verifies SSL certificates for ALL custom domain mappings,
# not just Keycloak. Used by both phoenix-rebuild.sh and evacuate-region.sh.
# =============================================================================

# Wait for SSL certificates on multiple domains
# Usage: wait_for_all_domain_ssl <keycloak_domain> [app_domain] [api_domain] [extra_domains...]
#   Skips domains that are empty, equal to keycloak_domain, or have no domain mapping.
#   Returns 0 if all domains verified, 1 if any domain failed (non-fatal warning).
wait_for_all_domain_ssl() {
    local keycloak_domain="${1:-}"
    shift
    local additional_domains=("$@")

    if [ ${#additional_domains[@]} -eq 0 ]; then
        log_info "No additional domains to verify SSL for"
        return 0
    fi

    # Bug #25 fix: Use GCP_DR_REGION (DR) with fallback to GCP_REGION (prod)
    local region="${GCP_DR_REGION:-${GCP_REGION:-$(gcloud config get-value compute/region 2>/dev/null || echo "")}}"
    local failed=0

    log_info "Verifying SSL certificates for additional domains (Issue #102 fix)..."

    for domain in "${additional_domains[@]}"; do
        # Skip empty domains
        if [ -z "$domain" ]; then
            continue
        fi

        # Skip if this domain is the same as keycloak_domain (already verified)
        if [ "$domain" = "$keycloak_domain" ]; then
            continue
        fi

        # Check if domain mapping exists
        if ! gcloud beta run domain-mappings describe --domain="$domain" --region="$region" &>/dev/null 2>&1; then
            log_info "No domain mapping for $domain - skipping SSL check"
            continue
        fi

        log_info "Waiting for SSL certificate on $domain..."
        if wait_for_ssl_certificate "$domain" "/" 900; then
            log_info "SSL certificate for $domain is deployed and working"
        else
            log_warn "SSL certificate for $domain not verified after 15 minutes"
            log_warn "E2E tests may fail with 525 errors for $domain"
            failed=$((failed + 1))
        fi
    done

    if [ $failed -gt 0 ]; then
        log_warn "$failed domain(s) failed SSL verification"
        return 1
    fi

    log_info "All additional domain SSL certificates verified"
    return 0
}

# =============================================================================
# STAGED TERRAFORM DEPLOYMENT (Issue #37 pattern from phoenix-rebuild.sh)
# =============================================================================
# Problem: mcp-gateway fails startup probes if Keycloak SSL cert isn't ready.
# Solution: Deploy in stages - first Keycloak + domain mapping, wait for SSL,
# then deploy mcp-gateway.
#
# This pattern is used by both phoenix-rebuild.sh and evacuate-region.sh.
# =============================================================================

# Get terraform targets for Stage 1 (everything except mcp-gateway)
# Returns: Array of -target= arguments for terraform apply
# Usage: stage1_targets=($(get_stage1_terraform_targets))
get_stage1_terraform_targets() {
    cat <<'TARGETS'
-target=module.networking
-target=module.database
-target=module.security
-target=module.storage
-target=module.cloudrun.google_artifact_registry_repository.tamshai
-target=module.cloudrun.google_cloud_run_service.keycloak
-target=module.cloudrun.google_cloud_run_service.mcp_suite
-target=module.cloudrun.google_cloud_run_service.web_portal
-target=module.cloudrun.google_cloud_run_domain_mapping.keycloak
-target=module.cloudrun.google_cloud_run_domain_mapping.web_portal
-target=module.cloudrun.google_cloud_run_service_iam_member.keycloak_public
-target=module.cloudrun.google_cloud_run_service_iam_member.web_portal_public
-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_suite_gateway_access
-target=module.utility_vm
TARGETS
}

# Get terraform targets for Stage 2 (mcp-gateway only)
# Returns: Array of -target= arguments for terraform apply
# Usage: stage2_targets=($(get_stage2_terraform_targets))
get_stage2_terraform_targets() {
    cat <<'TARGETS'
-target=module.cloudrun.google_cloud_run_service.mcp_gateway
-target=module.cloudrun.google_cloud_run_domain_mapping.mcp_gateway
-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_gateway_public
TARGETS
}

# Run staged terraform deployment with SSL certificate wait
# Usage: staged_terraform_deploy <keycloak_domain> <keycloak_realm> <tf_var_args...>
#
# Arguments:
#   keycloak_domain: The Keycloak domain to wait for SSL (e.g., auth-dr.tamshai.com)
#   keycloak_realm: The Keycloak realm name (e.g., tamshai-corp)
#   tf_var_args: Remaining arguments passed to terraform apply as -var= arguments
#
# Example:
#   staged_terraform_deploy "auth-dr.tamshai.com" "tamshai-corp" \
#       -var="region=<REGION>" \
#       -var="project_id=my-project"
#
staged_terraform_deploy() {
    local keycloak_domain="$1"
    local keycloak_realm="$2"
    shift 2
    local tf_args=("$@")

    log_info "=== Staged Terraform Deployment (Issue #37 pattern) ==="
    log_info "Stage 1: Deploy Keycloak + MCP Suite (triggers SSL provisioning)"
    log_info "Stage 2: Wait for SSL certificate on $keycloak_domain"
    log_info "Stage 3: Deploy mcp-gateway (requires Keycloak JWKS)"

    # Pre-stage: Verify state is ready for staged deployment (Issue #102)
    # IMPORTANT: Do NOT import here - the calling script (evacuate-region.sh) handles imports.
    # Importing twice with GCS backend + -target flags causes state sync issues.
    # We only verify existing resources are in state and refresh if needed.
    log_step "Pre-stage: Verifying terraform state is ready..."
    local project_id region
    for arg in "${tf_args[@]}"; do
        case "$arg" in
            -var=project_id=*) project_id="${arg#-var=project_id=}" ;;
            -var=region=*) region="${arg#-var=region=}" ;;
        esac
    done
    log_info "  Extracted: project_id=$project_id, region=$region"

    # Refresh state to ensure GCS backend is synced
    log_info "  Refreshing terraform state..."
    terraform refresh "${tf_args[@]}" -compact-warnings 2>/dev/null || true

    if [[ -n "$project_id" ]] && [[ -n "$region" ]]; then
        # Check if Artifact Registry exists in GCP
        if gcloud artifacts repositories describe tamshai --location="$region" --project="$project_id" &>/dev/null 2>&1; then
            log_info "  Artifact Registry exists in GCP"

            # Check if it's in terraform state after refresh
            if terraform state list 2>/dev/null | grep -q 'google_artifact_registry_repository.tamshai'; then
                log_info "  Artifact Registry is in terraform state - proceeding with staged deployment"
            else
                # Issue #102 Fix: Import the registry instead of falling back to full apply
                # Full apply would fail with 409 because registry already exists
                log_warn "  Artifact Registry NOT in state - importing to prevent 409 error"
                log_info "  Running: terraform import module.cloudrun.google_artifact_registry_repository.tamshai"
                if terraform import "${tf_args[@]}" \
                    'module.cloudrun.google_artifact_registry_repository.tamshai' \
                    "projects/${project_id}/locations/${region}/repositories/tamshai" 2>/dev/null; then
                    log_success "  Import successful - proceeding with staged deployment"
                else
                    log_warn "  Import failed (may already be in state or resource mismatch)"
                    log_warn "  Attempting to continue with staged deployment anyway"
                fi
            fi
        else
            log_info "  Artifact Registry does not exist in GCP - will be created by Stage 1"
        fi
    else
        log_warn "  Could not extract project_id/region from terraform args"
        log_warn "  tf_args: ${tf_args[*]}"
    fi

    # Stage 1: Deploy everything except mcp-gateway
    log_step "Stage 1: Deploying infrastructure (except mcp-gateway)..."
    local stage1_targets
    stage1_targets=$(get_stage1_terraform_targets)

    if ! terraform apply -auto-approve ${stage1_targets} "${tf_args[@]}"; then
        log_error "Stage 1 terraform apply failed"
        return 1
    fi
    log_success "Stage 1 complete - Keycloak and MCP Suite deployed"

    # Stage 2: Wait for SSL certificate
    log_step "Stage 2: Waiting for SSL certificate on ${keycloak_domain}..."
    log_info "SSL provisioning typically takes 10-15 minutes for new domain mappings"

    if ! wait_for_ssl_certificate "$keycloak_domain" "/auth/realms/${keycloak_realm}/.well-known/openid-configuration" 1350; then
        log_warn "SSL certificate not ready after 22.5 minutes"
        log_warn "mcp-gateway deployment may fail - consider retrying later"
        # Don't fail here - let user decide whether to continue
    fi

    # Stage 3: Deploy mcp-gateway
    log_step "Stage 3: Deploying mcp-gateway..."
    local stage2_targets
    stage2_targets=$(get_stage2_terraform_targets)

    if ! terraform apply -auto-approve ${stage2_targets} "${tf_args[@]}"; then
        log_error "Stage 3 terraform apply failed (mcp-gateway)"
        log_error "This usually means Keycloak SSL isn't ready yet"
        log_error "Wait a few minutes and run: terraform apply ${stage2_targets}"
        return 1
    fi

    log_success "=== Staged Deployment Complete ==="
    return 0
}

echo "[domain-mapping] Library loaded (KEYCLOAK_DOMAIN=$KEYCLOAK_DOMAIN, KEYCLOAK_REALM=$KEYCLOAK_REALM)"

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
