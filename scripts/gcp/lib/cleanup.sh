#!/bin/bash
# Phoenix Rebuild - Cleanup Functions
# Functions for pre-destroy and post-destroy cleanup

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

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
# PRE-DESTROY CLEANUP (Stage 1)
# =============================================================================

# Gap #21: Delete Cloud Run Job (has deletion_protection)
delete_cloud_run_jobs() {
    log_info "Deleting Cloud Run jobs..."
    local jobs
    jobs=$(gcloud run jobs list --region="$REGION" --format="value(name)" 2>/dev/null | grep -E "provision" || true)

    if [[ -z "$jobs" ]]; then
        log_info "No Cloud Run jobs to delete"
        return 0
    fi

    for job in $jobs; do
        log_info "Deleting job: $job"
        gcloud run jobs delete "$job" --region="$REGION" --quiet 2>/dev/null || log_warn "Failed to delete job $job (may not exist)"
    done
}

# Gap #22: Disable Cloud SQL deletion protection
disable_cloudsql_deletion_protection() {
    log_info "Disabling Cloud SQL deletion protection..."
    local instances
    instances=$(gcloud sql instances list --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -z "$instances" ]]; then
        log_info "No Cloud SQL instances found"
        return 0
    fi

    for instance in $instances; do
        log_info "Disabling deletion protection for: $instance"
        gcloud sql instances patch "$instance" --no-deletion-protection --quiet 2>/dev/null || log_warn "Failed to patch $instance"
    done
}

# Gap #1: Force-unlock stale terraform state
force_unlock_terraform_state() {
    local lock_id="$1"
    log_info "Force-unlocking terraform state with lock ID: $lock_id"
    terraform force-unlock -force "$lock_id"
}

# =============================================================================
# DURING DESTROY CLEANUP (Stage 2)
# =============================================================================

# Gap #23: Remove service networking from terraform state
remove_service_networking_from_state() {
    log_info "Removing service networking connection from terraform state..."
    terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || log_warn "Resource not in state"
    terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || log_warn "Resource not in state"
}

# Gap #24: Delete orphaned private IP address
delete_orphaned_private_ip() {
    log_info "Checking for orphaned private IP addresses..."
    local ips
    ips=$(gcloud compute addresses list --global --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -z "$ips" ]]; then
        log_info "No orphaned private IP addresses found"
        return 0
    fi

    for ip in $ips; do
        log_info "Deleting private IP address: $ip"
        gcloud compute addresses delete "$ip" --global --quiet 2>/dev/null || log_warn "Failed to delete $ip"
    done
}

# Gap #25: Targeted destroy of VPC when vpc_connector_id count fails
targeted_destroy_vpc() {
    log_info "Running targeted destroy of VPC network..."
    terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
}

# =============================================================================
# POST-DESTROY CLEANUP (Stage 3)
# =============================================================================

# Gap #1b: Remove stale Cloud Run entries from terraform state
remove_stale_cloudrun_state() {
    log_info "Removing stale Cloud Run entries from terraform state..."
    local resources=(
        'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]'
        'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]'
        'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]'
        'module.cloudrun.google_cloud_run_service.mcp_suite["support"]'
        'module.cloudrun.google_cloud_run_service.keycloak'
        'module.cloudrun.google_cloud_run_service.web_portal[0]'
        'module.cloudrun.google_cloud_run_service.mcp_gateway'
    )

    for resource in "${resources[@]}"; do
        terraform state rm "$resource" 2>/dev/null || true
    done
    log_info "Stale state entries removed"
}

# Gap #2: Delete persisted secrets
delete_persisted_secrets() {
    log_info "Deleting persisted GCP secrets..."
    local secrets=(
        "tamshai-prod-keycloak-admin-password"
        "tamshai-prod-keycloak-db-password"
        "tamshai-prod-db-password"
        "tamshai-prod-anthropic-api-key"
        "tamshai-prod-mcp-gateway-client-secret"
        "tamshai-prod-jwt-secret"
        "mcp-hr-service-client-secret"
        "prod-user-password"
        "tamshai-prod-mongodb-uri"
    )

    for secret in "${secrets[@]}"; do
        gcloud secrets delete "$secret" --quiet 2>/dev/null && log_info "Deleted: $secret" || true
    done
}

# Gap #3: Delete Cloud SQL instance if still exists
delete_cloudsql_instance() {
    log_info "Checking for Cloud SQL instances to delete..."
    local instances
    instances=$(gcloud sql instances list --format="value(name)" 2>/dev/null | grep -E "tamshai" || true)

    if [[ -z "$instances" ]]; then
        log_info "No Cloud SQL instances to delete"
        return 0
    fi

    for instance in $instances; do
        log_info "Deleting Cloud SQL instance: $instance"
        gcloud sql instances delete "$instance" --quiet 2>/dev/null || log_warn "Failed to delete $instance"
    done
}

# =============================================================================
# POST-APPLY CLEANUP (Stage 6)
# =============================================================================

# Gap #11, #27, #29: Delete failed Cloud Run services
delete_failed_cloudrun_services() {
    log_info "Checking for failed Cloud Run services..."
    local services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)

    for svc in "${services[@]}"; do
        local status
        status=$(gcloud run services describe "$svc" --region="$REGION" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")

        if [[ "$status" != "True" && "$status" != "NOT_FOUND" ]]; then
            log_warn "Deleting failed service: $svc (status: $status)"
            gcloud run services delete "$svc" --region="$REGION" --quiet 2>/dev/null || true
        fi
    done
}

# =============================================================================
# COMPOSITE FUNCTIONS
# =============================================================================

# Run all pre-destroy cleanup
pre_destroy_cleanup() {
    log_info "=== Pre-Destroy Cleanup ==="
    delete_cloud_run_jobs
    disable_cloudsql_deletion_protection
    log_info "=== Pre-Destroy Cleanup Complete ==="
}

# Run all post-destroy cleanup
post_destroy_cleanup() {
    log_info "=== Post-Destroy Cleanup ==="
    delete_persisted_secrets
    delete_cloudsql_instance
    delete_cloud_run_jobs
    delete_orphaned_private_ip
    log_info "=== Post-Destroy Cleanup Complete ==="
}
