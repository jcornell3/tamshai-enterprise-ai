#!/bin/bash
# =============================================================================
# GCP Cleanup Library - Resource Cleanup Functions
# =============================================================================
#
# Functions for pre-destroy and post-destroy cleanup.
# Supports both primary (no suffix) and recovery (with suffix) environments.
#
# Usage:
#   source /path/to/scripts/gcp/lib/cleanup.sh
#   delete_cloudsql_instance ""                    # Primary: tamshai-prod-postgres
#   delete_cloudsql_instance "-recovery-20260123"  # Recovery: tamshai-prod-postgres-recovery-20260123
#
# Required environment variables:
#   GCP_REGION  - GCP region (e.g., us-central1)
#   GCP_PROJECT - GCP project ID
#
# Optional configuration variables (set before sourcing or use defaults):
#   RESOURCE_PREFIX - Resource naming prefix (default: tamshai-prod)
#   SECRET_* variables for secret names
#
# Ref: Issue #102 - Unify prod and DR deployments
# =============================================================================

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

# Required environment variables
: "${GCP_REGION:?ERROR: GCP_REGION environment variable must be set}"
: "${GCP_PROJECT:?ERROR: GCP_PROJECT environment variable must be set}"

REGION="$GCP_REGION"
PROJECT="$GCP_PROJECT"

# Resource naming prefix (configurable for different environments)
RESOURCE_PREFIX="${RESOURCE_PREFIX:-tamshai-prod}"

# Colors for output (use common.sh if available, otherwise define locally)
if ! type log_info &>/dev/null; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    NC='\033[0m'

    log_info() { echo -e "${GREEN}[cleanup]${NC} $1"; }
    log_warn() { echo -e "${YELLOW}[cleanup]${NC} $1"; }
    log_error() { echo -e "${RED}[cleanup]${NC} $1"; }
    log_step() { echo -e "${CYAN}[cleanup]${NC} $1"; }
fi

# =============================================================================
# PRE-DESTROY CLEANUP (Stage 1)
# =============================================================================

# Gap #21: Delete Cloud Run Job (has deletion_protection)
# Usage: delete_cloud_run_jobs [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
delete_cloud_run_jobs() {
    local name_suffix="${1:-}"
    local pattern="provision${name_suffix}"

    log_info "Deleting Cloud Run jobs matching: $pattern"
    local jobs
    jobs=$(gcloud run jobs list --region="$REGION" --format="value(name)" 2>/dev/null | grep -E "$pattern" || true)

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
# Usage: disable_cloudsql_deletion_protection [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
disable_cloudsql_deletion_protection() {
    local name_suffix="${1:-}"
    local instance_name="${RESOURCE_PREFIX}-postgres${name_suffix}"

    log_info "Disabling Cloud SQL deletion protection for: $instance_name"

    if ! gcloud sql instances describe "$instance_name" --project="$PROJECT" &>/dev/null; then
        log_info "Cloud SQL instance not found: $instance_name"
        return 0
    fi

    gcloud sql instances patch "$instance_name" \
        --no-deletion-protection \
        --project="$PROJECT" \
        --quiet 2>/dev/null || log_warn "Failed to disable deletion protection for $instance_name (may already be disabled)"
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
# Usage: delete_orphaned_private_ip [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
delete_orphaned_private_ip() {
    local name_suffix="${1:-}"
    local ip_name="${RESOURCE_PREFIX}-private-ip${name_suffix}"

    log_info "Checking for orphaned private IP address: $ip_name"

    if ! gcloud compute addresses describe "$ip_name" --global --project="$PROJECT" &>/dev/null; then
        log_info "Private IP address not found: $ip_name"
        return 0
    fi

    log_info "Deleting private IP address: $ip_name"
    gcloud compute addresses delete "$ip_name" --global --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $ip_name"
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
# Usage: delete_cloudsql_instance [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
delete_cloudsql_instance() {
    local name_suffix="${1:-}"
    local instance_name="${RESOURCE_PREFIX}-postgres${name_suffix}"

    log_info "Checking for Cloud SQL instance: $instance_name"

    if ! gcloud sql instances describe "$instance_name" --project="$PROJECT" &>/dev/null; then
        log_info "Cloud SQL instance not found: $instance_name"
        return 0
    fi

    log_info "Deleting Cloud SQL instance: $instance_name"
    gcloud sql instances delete "$instance_name" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $instance_name"
}

# =============================================================================
# POST-APPLY CLEANUP (Stage 6)
# =============================================================================

# Gap #11, #27, #29: Delete failed Cloud Run services
# Usage: delete_failed_cloudrun_services [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
delete_failed_cloudrun_services() {
    local name_suffix="${1:-}"
    local base_services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)

    log_info "Checking for failed Cloud Run services (suffix: '${name_suffix:-none}')"

    for base_svc in "${base_services[@]}"; do
        local svc="${base_svc}${name_suffix}"
        local status
        status=$(gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")

        if [[ "$status" != "True" && "$status" != "NOT_FOUND" ]]; then
            log_warn "Deleting failed service: $svc (status: $status)"
            gcloud run services delete "$svc" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || true
        fi
    done
}

# Delete all Cloud Run services for an environment
# Usage: delete_cloudrun_services [name_suffix]
#   name_suffix: Optional suffix for recovery environments (e.g., "-recovery-20260123")
delete_cloudrun_services() {
    local name_suffix="${1:-}"
    local base_services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)

    log_info "Deleting Cloud Run services (suffix: '${name_suffix:-none}')"

    for base_svc in "${base_services[@]}"; do
        local svc="${base_svc}${name_suffix}"

        if gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
            log_info "Deleting service: $svc"
            gcloud run services delete "$svc" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $svc"
        fi
    done
}

# =============================================================================
# VPC CLEANUP FUNCTIONS (Issue #102)
# =============================================================================

# Delete VPC connector
# Usage: delete_vpc_connector [name_suffix]
delete_vpc_connector() {
    local name_suffix="${1:-}"
    local connector_name="${RESOURCE_PREFIX}-conn${name_suffix}"

    log_info "Checking for VPC connector: $connector_name"

    if ! gcloud compute networks vpc-access connectors describe "$connector_name" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "VPC connector not found: $connector_name"
        return 0
    fi

    log_info "Deleting VPC connector: $connector_name"
    gcloud compute networks vpc-access connectors delete "$connector_name" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $connector_name"
}

# Delete VPC peering connection
# Usage: delete_vpc_peering [name_suffix]
delete_vpc_peering() {
    local name_suffix="${1:-}"
    local vpc_name="${RESOURCE_PREFIX}-vpc${name_suffix}"

    log_info "Checking for VPC peering on: $vpc_name"

    # Delete servicenetworking peering
    if gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT" 2>/dev/null | grep -q servicenetworking; then
        log_info "Deleting servicenetworking VPC peering..."
        gcloud services vpc-peerings delete \
            --network="$vpc_name" \
            --service=servicenetworking.googleapis.com \
            --project="$PROJECT" \
            --quiet 2>/dev/null || log_warn "Failed to delete VPC peering"
    fi
}

# Delete firewall rules for VPC
# Usage: delete_firewall_rules [name_suffix]
delete_firewall_rules() {
    local name_suffix="${1:-}"
    local vpc_name="${RESOURCE_PREFIX}-vpc${name_suffix}"

    log_info "Deleting firewall rules for VPC: $vpc_name"

    local rules
    rules=$(gcloud compute firewall-rules list --filter="network:$vpc_name" --format="value(name)" --project="$PROJECT" 2>/dev/null || true)

    if [[ -z "$rules" ]]; then
        log_info "No firewall rules found for $vpc_name"
        return 0
    fi

    for rule in $rules; do
        log_info "Deleting firewall rule: $rule"
        gcloud compute firewall-rules delete "$rule" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $rule"
    done
}

# Delete VPC subnets
# Usage: delete_vpc_subnets [name_suffix]
delete_vpc_subnets() {
    local name_suffix="${1:-}"
    local subnet_name="${RESOURCE_PREFIX}-subnet${name_suffix}"

    log_info "Checking for subnet: $subnet_name"

    if ! gcloud compute networks subnets describe "$subnet_name" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "Subnet not found: $subnet_name"
        return 0
    fi

    log_info "Deleting subnet: $subnet_name"
    gcloud compute networks subnets delete "$subnet_name" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $subnet_name"
}

# Delete VPC network
# Usage: delete_vpc_network [name_suffix]
delete_vpc_network() {
    local name_suffix="${1:-}"
    local vpc_name="${RESOURCE_PREFIX}-vpc${name_suffix}"

    log_info "Checking for VPC network: $vpc_name"

    if ! gcloud compute networks describe "$vpc_name" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "VPC network not found: $vpc_name"
        return 0
    fi

    log_info "Deleting VPC network: $vpc_name"
    gcloud compute networks delete "$vpc_name" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $vpc_name"
}

# =============================================================================
# COMPOSITE FUNCTIONS
# =============================================================================

# Run all pre-destroy cleanup
# Usage: pre_destroy_cleanup [name_suffix]
pre_destroy_cleanup() {
    local name_suffix="${1:-}"

    log_info "=== Pre-Destroy Cleanup (suffix: '${name_suffix:-none}') ==="
    delete_cloud_run_jobs "$name_suffix"
    disable_cloudsql_deletion_protection "$name_suffix"
    log_info "=== Pre-Destroy Cleanup Complete ==="
}

# Run all post-destroy cleanup
# Usage: post_destroy_cleanup [name_suffix]
post_destroy_cleanup() {
    local name_suffix="${1:-}"

    log_info "=== Post-Destroy Cleanup (suffix: '${name_suffix:-none}') ==="
    delete_cloudsql_instance "$name_suffix"
    delete_cloud_run_jobs "$name_suffix"
    delete_orphaned_private_ip "$name_suffix"
    log_info "=== Post-Destroy Cleanup Complete ==="
}

# Full cleanup of all resources for an environment
# Usage: full_environment_cleanup [name_suffix]
#   This is the nuclear option - deletes everything for a recovery stack
full_environment_cleanup() {
    local name_suffix="${1:-}"

    log_info "=== Full Environment Cleanup (suffix: '${name_suffix:-none}') ==="
    log_warn "This will delete ALL resources for this environment!"

    # Order matters - delete in dependency order
    delete_cloudrun_services "$name_suffix"
    delete_cloud_run_jobs "$name_suffix"
    disable_cloudsql_deletion_protection "$name_suffix"
    delete_cloudsql_instance "$name_suffix"
    delete_vpc_connector "$name_suffix"
    delete_vpc_peering "$name_suffix"
    delete_firewall_rules "$name_suffix"
    delete_vpc_subnets "$name_suffix"
    delete_orphaned_private_ip "$name_suffix"
    delete_vpc_network "$name_suffix"

    log_info "=== Full Environment Cleanup Complete ==="
}

echo "[cleanup] Library loaded (RESOURCE_PREFIX=$RESOURCE_PREFIX)"
