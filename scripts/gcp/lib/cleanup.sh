#!/bin/bash
# =============================================================================
# GCP Cleanup Library - Resource Cleanup Functions
# =============================================================================
#
# Functions for pre-destroy and post-destroy cleanup.
# Supports both primary (no suffix) and recovery (with suffix) environments.
#
# NAMING CONVENTION (matches Terraform):
#   Cloud Run services: NO suffix - always "mcp-gateway", "keycloak", etc.
#   VPC resources: NAME_PREFIX + type - "tamshai-prod-vpc" or "tamshai-prod-recovery-xxx-vpc"
#   Cloud SQL: RESOURCE_PREFIX + "-postgres" + suffix - "tamshai-prod-postgres-recovery-xxx"
#
# Usage:
#   source /path/to/scripts/gcp/lib/cleanup.sh
#
#   # Primary environment
#   NAME_PREFIX="tamshai-prod" delete_vpc_network       # Deletes tamshai-prod-vpc
#   delete_cloudsql_instance ""                          # Deletes tamshai-prod-postgres
#
#   # Recovery environment
#   NAME_PREFIX="tamshai-prod-recovery-xxx" delete_vpc_network  # Deletes tamshai-prod-recovery-xxx-vpc
#   delete_cloudsql_instance "-recovery-xxx"                     # Deletes tamshai-prod-postgres-recovery-xxx
#
# Required environment variables:
#   GCP_REGION  - GCP region (e.g., us-central1)
#   GCP_PROJECT - GCP project ID
#
# Optional configuration variables (set before sourcing or use defaults):
#   RESOURCE_PREFIX - Base resource prefix without suffix (default: tamshai-prod)
#   NAME_PREFIX     - Full name prefix including suffix (default: $RESOURCE_PREFIX)
#   ENV_ID          - Environment ID for connector MD5 hash (default: primary)
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

# Resource naming (configurable for different environments)
# RESOURCE_PREFIX: Base prefix without any suffix (e.g., "tamshai-prod")
# NAME_PREFIX: Full prefix including any suffix (e.g., "tamshai-prod-recovery-xxx")
RESOURCE_PREFIX="${RESOURCE_PREFIX:-tamshai-prod}"
NAME_PREFIX="${NAME_PREFIX:-${RESOURCE_PREFIX}}"
ENV_ID="${ENV_ID:-primary}"

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
# NOTE: Private IP is created by database module with pattern: tamshai-prod-private-ip${suffix}
# (Same pattern as Cloud SQL: suffix at end)
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

# =============================================================================
# COMPREHENSIVE TERRAFORM STATE CLEANUP (from phoenix-rebuild.sh)
# =============================================================================
# These functions remove resources from Terraform state that cause issues during
# destroy operations. Ported from phoenix-rebuild.sh for reuse in DR cleanup.
#
# Issue #28: Secrets and IAM bindings must be removed BEFORE terraform destroy
# Gap #23-25: Service networking and VPC connector state causes circular deps
# =============================================================================

# Remove all Cloud SQL related resources from terraform state
# Usage: remove_cloudsql_state
remove_cloudsql_state() {
    log_info "Removing Cloud SQL resources from terraform state..."
    local resources=(
        'module.database.google_sql_database_instance.postgres'
        'module.database.google_sql_database.keycloak'
        'module.database.google_sql_database.keycloak_db'
        'module.database.google_sql_database.tamshai'
        'module.database.google_sql_database.hr_db'
        'module.database.google_sql_database.finance_db'
        'module.database.google_sql_user.keycloak'
        'module.database.google_sql_user.keycloak_user'
        'module.database.google_sql_user.tamshai'
        'module.database.google_sql_user.tamshai_user'
        'module.database.google_sql_user.postgres_user'
    )

    for resource in "${resources[@]}"; do
        terraform state rm "$resource" 2>/dev/null || true
    done
    log_info "Cloud SQL state entries removed"
}

# Remove all secret IAM binding resources from terraform state (Issue #28)
# These must be removed BEFORE terraform destroy to avoid "secret not found" errors
# Usage: remove_secret_iam_bindings_state
remove_secret_iam_bindings_state() {
    log_info "Removing secret IAM bindings from terraform state (Issue #28)..."
    local resources=(
        # Keycloak-related IAM bindings
        'module.security.google_secret_manager_secret_iam_member.keycloak_admin_access'
        'module.security.google_secret_manager_secret_iam_member.keycloak_db_access'
        # MCP Gateway-related IAM bindings
        'module.security.google_secret_manager_secret_iam_member.mcp_gateway_anthropic_access'
        'module.security.google_secret_manager_secret_iam_member.mcp_gateway_client_secret_access'
        'module.security.google_secret_manager_secret_iam_member.mcp_gateway_jwt_access'
        'module.security.google_secret_manager_secret_iam_member.mcp_gateway_mongodb_uri_access[0]'
        # MCP Servers-related IAM bindings
        'module.security.google_secret_manager_secret_iam_member.mcp_servers_db_access'
        'module.security.google_secret_manager_secret_iam_member.mcp_servers_mongodb_uri_access[0]'
        # Cloud Build-related IAM bindings
        'module.security.google_secret_manager_secret_iam_member.cloudbuild_db_password'
        'module.security.google_secret_manager_secret_iam_member.cloudbuild_keycloak_admin'
        'module.security.google_secret_manager_secret_iam_member.cloudbuild_mcp_hr_client'
        'module.security.google_secret_manager_secret_iam_member.cloudbuild_prod_user_password'
        # Provision job-related IAM bindings
        'module.security.google_secret_manager_secret_iam_member.provision_job_db_password'
        'module.security.google_secret_manager_secret_iam_member.provision_job_keycloak_admin'
        'module.security.google_secret_manager_secret_iam_member.provision_job_mcp_hr_client'
        'module.security.google_secret_manager_secret_iam_member.provision_job_prod_user_password'
    )

    for resource in "${resources[@]}"; do
        terraform state rm "$resource" 2>/dev/null || true
    done
    log_info "Secret IAM binding state entries removed"
}

# Remove all secret shell and version resources from terraform state
# Usage: remove_secret_state
remove_secret_state() {
    log_info "Removing secret shells and versions from terraform state..."
    local resources=(
        # Secret shells
        'module.security.google_secret_manager_secret.keycloak_admin_password'
        'module.security.google_secret_manager_secret.keycloak_db_password'
        'module.security.google_secret_manager_secret.tamshai_db_password'
        'module.security.google_secret_manager_secret.anthropic_api_key'
        'module.security.google_secret_manager_secret.mcp_gateway_client_secret'
        'module.security.google_secret_manager_secret.jwt_secret'
        'module.security.google_secret_manager_secret.mcp_hr_service_client_secret'
        'module.security.google_secret_manager_secret.prod_user_password'
        # Secret versions
        'module.security.google_secret_manager_secret_version.keycloak_admin_password'
        'module.security.google_secret_manager_secret_version.keycloak_db_password'
        'module.security.google_secret_manager_secret_version.anthropic_api_key'
        'module.security.google_secret_manager_secret_version.mcp_gateway_client_secret'
        'module.security.google_secret_manager_secret_version.jwt_secret'
        'module.security.google_secret_manager_secret_version.mcp_hr_service_client_secret'
        'module.security.google_secret_manager_secret_version.prod_user_password'
    )

    for resource in "${resources[@]}"; do
        terraform state rm "$resource" 2>/dev/null || true
    done
    log_info "Secret state entries removed"
}

# Remove all VPC connector variations from terraform state (Gap #25)
# Handles different resource naming patterns across terraform versions
# Usage: remove_vpc_connector_state
remove_vpc_connector_state() {
    log_info "Removing VPC connector from terraform state (Gap #25)..."
    local resources=(
        'module.networking.google_vpc_access_connector.connector[0]'
        'module.networking.google_vpc_access_connector.connector'
        'module.networking.google_vpc_access_connector.serverless_connector[0]'
        'module.networking.google_vpc_access_connector.serverless_connector'
    )

    for resource in "${resources[@]}"; do
        terraform state rm "$resource" 2>/dev/null || true
    done
    log_info "VPC connector state entries removed"
}

# Comprehensive terraform state cleanup - removes all problematic resources
# Call this BEFORE terraform destroy to prevent common failures
# Usage: remove_all_problematic_state
remove_all_problematic_state() {
    log_info "=== Comprehensive Terraform State Cleanup ==="

    # Order matters: IAM bindings first, then secrets, then infrastructure
    remove_secret_iam_bindings_state
    remove_secret_state
    remove_cloudsql_state
    remove_service_networking_from_state
    remove_vpc_connector_state
    remove_stale_cloudrun_state

    log_info "=== Terraform State Cleanup Complete ==="
}

# Gap #2: Delete persisted secrets
delete_persisted_secrets() {
    log_info "Deleting persisted GCP secrets..."
    local secrets=(
        "tamshai-prod-keycloak-admin-password"
        "tamshai-prod-keycloak-db-password"
        "tamshai-prod-db-password"
        "tamshai-prod-claude-api-key"
        "tamshai-prod-mcp-gateway-client-secret"
        "tamshai-prod-jwt-secret"
        "mcp-hr-service-client-secret"
        "prod-user-password"
        # NOTE: tamshai-prod-mongodb-uri is NOT deleted - it's manually created
        # and contains the MongoDB Atlas connection string that persists across rebuilds
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
# NOTE: Cloud Run services have NO suffix in Terraform - same names for prod and DR
# Usage: delete_failed_cloudrun_services
delete_failed_cloudrun_services() {
    local services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)

    log_info "Checking for failed Cloud Run services"

    for svc in "${services[@]}"; do
        local status
        status=$(gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")

        if [[ "$status" != "True" && "$status" != "NOT_FOUND" ]]; then
            log_warn "Deleting failed service: $svc (status: $status)"
            gcloud run services delete "$svc" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || true
        fi
    done
}

# Delete all Cloud Run services
# NOTE: Cloud Run services have NO suffix in Terraform - same names for prod and DR
# Usage: delete_cloudrun_services
delete_cloudrun_services() {
    local services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)

    log_info "Deleting Cloud Run services"

    for svc in "${services[@]}"; do
        if gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
            log_info "Deleting service: $svc"
            gcloud run services delete "$svc" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $svc"
        fi
    done
}

# =============================================================================
# VPC CLEANUP FUNCTIONS (Issue #102)
# =============================================================================
# NOTE: VPC resources use NAME_PREFIX (which includes any suffix)
# Terraform naming: ${name_prefix}-vpc, ${name_prefix}-subnet, etc.
# Example: NAME_PREFIX="tamshai-prod-recovery-xxx" → "tamshai-prod-recovery-xxx-vpc"

# Delete VPC connector (battle-tested pattern from phoenix-rebuild.sh)
# NOTE: VPC connector uses different naming for prod vs DR:
#   - Primary: tamshai-prod-connector (hardcoded in prod terraform)
#   - DR: tamshai-<md5(suffix)[0:8]> (MD5 hash for long suffixes, max 25 chars)
# Usage: delete_vpc_connector
delete_vpc_connector() {
    local connector_name

    # Match Terraform's naming patterns
    if [[ "$ENV_ID" == "primary" ]] || [[ -z "$ENV_ID" ]]; then
        # Primary environment uses hardcoded connector name (battle-tested)
        connector_name="${RESOURCE_PREFIX}-connector"
    else
        # DR environment uses MD5 hash (max 25 chars for connector name)
        local suffix_hash
        suffix_hash=$(echo -n "-${ENV_ID}" | md5sum | cut -c1-8)
        connector_name="tamshai-${suffix_hash}"
    fi

    log_info "Checking for VPC connector: $connector_name"

    if ! gcloud compute networks vpc-access connectors describe "$connector_name" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "VPC connector not found: $connector_name"
        return 0
    fi

    log_info "Deleting VPC connector: $connector_name"
    gcloud compute networks vpc-access connectors delete "$connector_name" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $connector_name"
}

# Delete VPC peering connection (simple — use delete_vpc_peering_robust for retry logic)
# Usage: delete_vpc_peering
delete_vpc_peering() {
    local vpc_name="${NAME_PREFIX}-vpc"

    log_info "Checking for VPC peering on: $vpc_name"

    # Delete servicenetworking peering
    if gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT" 2>/dev/null | grep -q servicenetworking; then
        log_info "Deleting servicenetworking VPC peering..."
        local output
        output=$(gcloud services vpc-peerings delete \
            --network="$vpc_name" \
            --service=servicenetworking.googleapis.com \
            --project="$PROJECT" \
            --quiet 2>&1) || {
            log_warn "VPC peering deletion failed: $output"
        }
    fi
}

# Delete firewall rules for VPC
# Usage: delete_firewall_rules
delete_firewall_rules() {
    local vpc_name="${NAME_PREFIX}-vpc"

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
# Usage: delete_vpc_subnets
delete_vpc_subnets() {
    local subnet_name="${NAME_PREFIX}-subnet"

    log_info "Checking for subnet: $subnet_name"

    if ! gcloud compute networks subnets describe "$subnet_name" --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "Subnet not found: $subnet_name"
        return 0
    fi

    log_info "Deleting subnet: $subnet_name"
    gcloud compute networks subnets delete "$subnet_name" --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $subnet_name"
}

# Delete VPC network
# Usage: delete_vpc_network
delete_vpc_network() {
    local vpc_name="${NAME_PREFIX}-vpc"

    log_info "Checking for VPC network: $vpc_name"

    if ! gcloud compute networks describe "$vpc_name" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "VPC network not found: $vpc_name"
        return 0
    fi

    log_info "Deleting VPC network: $vpc_name"
    gcloud compute networks delete "$vpc_name" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $vpc_name"
}

# Delete Cloud NAT
# Usage: delete_cloud_nat
delete_cloud_nat() {
    local nat_name="${NAME_PREFIX}-nat"
    local router_name="${NAME_PREFIX}-router"

    log_info "Checking for Cloud NAT: $nat_name"

    if ! gcloud compute routers nats describe "$nat_name" --router="$router_name" \
        --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "Cloud NAT not found: $nat_name"
        return 0
    fi

    log_info "Deleting Cloud NAT: $nat_name"
    gcloud compute routers nats delete "$nat_name" --router="$router_name" \
        --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $nat_name"
}

# Delete Cloud Router
# Usage: delete_cloud_router
delete_cloud_router() {
    local router_name="${NAME_PREFIX}-router"

    log_info "Checking for Cloud Router: $router_name"

    if ! gcloud compute routers describe "$router_name" \
        --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "Cloud Router not found: $router_name"
        return 0
    fi

    log_info "Deleting Cloud Router: $router_name"
    gcloud compute routers delete "$router_name" \
        --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $router_name"
}

# Delete custom routes for VPC (excludes default routes)
# Usage: delete_vpc_routes
delete_vpc_routes() {
    local vpc_name="${NAME_PREFIX}-vpc"

    log_info "Deleting custom routes for VPC: $vpc_name"

    local routes
    routes=$(gcloud compute routes list \
        --filter="network:$vpc_name" \
        --format="value(name)" \
        --project="$PROJECT" 2>/dev/null | grep -v "^default-" || true)

    if [[ -z "$routes" ]]; then
        log_info "No custom routes found for $vpc_name"
        return 0
    fi

    for route in $routes; do
        log_info "Deleting route: $route"
        gcloud compute routes delete "$route" --project="$PROJECT" --quiet 2>/dev/null || log_warn "Failed to delete $route"
    done
}

# Delete GCE instances using the VPC subnet
# NOTE: Compute module doesn't use name_suffix, so instances have fixed names
#
# ZONE HANDLING (Issue #102): This function is ZONE-AGNOSTIC within a region.
# It filters by subnet (regional), discovers each instance's actual zone from
# metadata, and deletes using the correct zone. This handles cases where:
#   - Instances were created in fallback zones due to capacity issues
#   - Multiple deployment attempts used different zones
#   - Zone changed between pre-flight check and actual deployment
#
# Usage: delete_gce_instances_in_vpc
delete_gce_instances_in_vpc() {
    local subnet_name="${NAME_PREFIX}-subnet"

    log_info "Checking for GCE instances using subnet: $subnet_name (all zones in region)"

    local instances
    instances=$(gcloud compute instances list \
        --filter="networkInterfaces.subnetwork:${subnet_name}" \
        --format="csv[no-heading](name,zone)" \
        --project="$PROJECT" 2>/dev/null || true)

    if [[ -z "$instances" ]]; then
        log_info "No GCE instances found using subnet $subnet_name"
        return 0
    fi

    log_info "Found GCE instances using subnet $subnet_name"

    # Delete each instance
    while IFS=',' read -r instance_name instance_zone; do
        # Extract zone name from full path if needed
        instance_zone="${instance_zone##*/}"

        if [[ -n "$instance_name" ]] && [[ -n "$instance_zone" ]]; then
            log_info "  Deleting instance: $instance_name (zone: $instance_zone)"
            gcloud compute instances delete "$instance_name" \
                --zone="$instance_zone" \
                --project="$PROJECT" \
                --quiet 2>/dev/null || log_warn "Failed to delete $instance_name"
        fi
    done <<< "$instances"

    # Wait for deletions to complete
    log_info "Waiting for GCE instance deletions to complete..."
    local wait_count=0
    local max_wait=12  # 2 minutes max

    while [[ $wait_count -lt $max_wait ]]; do
        local remaining
        remaining=$(gcloud compute instances list \
            --filter="networkInterfaces.subnetwork:${subnet_name}" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null || true)

        if [[ -z "$remaining" ]]; then
            log_info "All GCE instances deleted"
            return 0
        fi

        wait_count=$((wait_count + 1))
        log_info "  Waiting for instances to terminate... [$wait_count/$max_wait]"
        sleep 10
    done

    log_warn "Timeout waiting for instance deletion. Some instances may still exist."
}

# Delete GCE instances by name pattern across ALL zones in the region
# ZONE HANDLING (Issue #102): Scans all zones for instances matching name pattern.
# This is a fallback for edge cases where:
#   - Subnet was deleted but instances weren't
#   - Instance network reference is broken
#   - Need to clean up instances across multiple zones (fallback zones)
#
# Usage: delete_gce_instances_by_pattern [name_pattern] [zones_to_check]
#   name_pattern: Glob pattern for instance names (default: "tamshai-*")
#   zones_to_check: Space-separated zone list (default: all zones in $REGION)
delete_gce_instances_by_pattern() {
    local name_pattern="${1:-tamshai-*}"
    local zones_to_check="${2:-}"

    # If no zones specified, get all zones in the region
    if [[ -z "$zones_to_check" ]]; then
        zones_to_check=$(gcloud compute zones list \
            --filter="region:$REGION" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null || echo "")
    fi

    if [[ -z "$zones_to_check" ]]; then
        log_warn "Could not get zones for region $REGION"
        return 0
    fi

    log_info "Scanning for GCE instances matching '$name_pattern' across zones in $REGION..."

    local found_any=false
    for zone in $zones_to_check; do
        local instances
        instances=$(gcloud compute instances list \
            --filter="name~'${name_pattern}' AND zone:${zone}" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null || true)

        for instance in $instances; do
            if [[ -n "$instance" ]]; then
                found_any=true
                log_info "  Found instance: $instance (zone: $zone) - deleting..."
                gcloud compute instances delete "$instance" \
                    --zone="$zone" \
                    --project="$PROJECT" \
                    --quiet 2>/dev/null || log_warn "Failed to delete $instance"
            fi
        done
    done

    if [[ "$found_any" == "false" ]]; then
        log_info "No GCE instances found matching '$name_pattern'"
    fi
}

# Wait for VPC connector deletion (async operation takes 2-3 minutes)
# Usage: wait_for_vpc_connector_deletion <connector_name> [timeout_attempts]
wait_for_vpc_connector_deletion() {
    local connector_name="$1"
    local max_wait="${2:-20}"  # Default 20 * 15s = 5 minutes
    local wait_count=0

    while gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; do
        wait_count=$((wait_count + 1))
        if [[ $wait_count -ge $max_wait ]]; then
            log_error "VPC connector '$connector_name' deletion timeout after $((max_wait * 15 / 60)) minutes"
            return 1
        fi
        log_info "  Waiting for VPC connector deletion (takes 2-3 minutes)... [$wait_count/$max_wait]"
        sleep 15
    done

    log_info "VPC connector '$connector_name' deleted"
    return 0
}

# Delete VPC connector with wait (battle-tested pattern from phoenix-rebuild.sh)
# Gap #25: VPC connector deletion is async - takes 2-3 minutes
# MUST complete before subnet deletion (connector uses subnet IPs)
# Usage: delete_vpc_connector_and_wait
delete_vpc_connector_and_wait() {
    local connector_name
    local vpc_name="${NAME_PREFIX}-vpc"

    # Determine expected connector name based on environment
    if [[ "$ENV_ID" == "primary" ]] || [[ -z "$ENV_ID" ]]; then
        # Primary: hardcoded name (battle-tested in phoenix-rebuild.sh)
        connector_name="${RESOURCE_PREFIX}-connector"
    else
        # DR: MD5 hash pattern
        local suffix_hash
        suffix_hash=$(echo -n "-${ENV_ID}" | md5sum | cut -c1-8)
        connector_name="tamshai-${suffix_hash}"
    fi

    log_info "Checking for VPC connector: $connector_name"

    # First check expected connector name
    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$REGION" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "VPC connector exists - deleting..."
        gcloud compute networks vpc-access connectors delete "$connector_name" \
            --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || {
            log_warn "VPC connector deletion initiated (async operation)"
        }

        # Wait for deletion (battle-tested timing from phoenix-rebuild.sh)
        wait_for_vpc_connector_deletion "$connector_name" || return 1
        log_info "VPC connector deleted from GCP"
    else
        log_info "VPC connector does not exist in GCP - skipping deletion"
    fi

    # Also scan for any orphaned connectors in this VPC
    log_info "Scanning for orphaned VPC connectors in: $vpc_name"

    local all_connectors
    all_connectors=$(gcloud compute networks vpc-access connectors list \
        --region="$REGION" \
        --project="$PROJECT" \
        --format="value(name)" 2>/dev/null | grep -E "^tamshai" || true)

    for connector in $all_connectors; do
        # Check if this connector is in our VPC
        local connector_network
        connector_network=$(gcloud compute networks vpc-access connectors describe "$connector" \
            --region="$REGION" --project="$PROJECT" \
            --format="value(network)" 2>/dev/null || echo "")

        # Extract network name from full path
        connector_network="${connector_network##*/}"

        if [[ "$connector_network" == "$vpc_name" ]]; then
            log_info "Found orphaned VPC connector '$connector' in VPC '$vpc_name' - deleting..."
            gcloud compute networks vpc-access connectors delete "$connector" \
                --region="$REGION" --project="$PROJECT" --quiet 2>/dev/null || true

            wait_for_vpc_connector_deletion "$connector" || return 1
        fi
    done

    return 0
}

# =============================================================================
# STORAGE BUCKET CLEANUP (Gap #39 from phoenix-rebuild.sh)
# =============================================================================
# Storage buckets must be emptied before terraform destroy (force_destroy=false)

# Empty a storage bucket
# Usage: empty_storage_bucket <bucket_name>
empty_storage_bucket() {
    local bucket="$1"

    if gcloud storage ls "gs://${bucket}" &>/dev/null 2>&1; then
        log_info "Emptying bucket: gs://${bucket}..."
        gcloud storage rm -r "gs://${bucket}/**" 2>/dev/null || log_info "  Bucket ${bucket} already empty or does not exist"
    fi
}

# Empty all known storage buckets (battle-tested from phoenix-rebuild.sh Gap #39)
# Usage: empty_all_storage_buckets
empty_all_storage_buckets() {
    log_info "Emptying storage buckets before destroy (Gap #39)..."

    # Known bucket patterns (adjust based on your terraform)
    local buckets=(
        "prod.tamshai.com"
        "${RESOURCE_PREFIX}-finance-docs"
        "${RESOURCE_PREFIX}-finance-docs-${PROJECT}"
        "${RESOURCE_PREFIX}-logs"
    )

    for bucket in "${buckets[@]}"; do
        empty_storage_bucket "$bucket"
    done
}

# =============================================================================
# SECRET CLEANUP (Gap #2, Issue #28 from phoenix-rebuild.sh)
# =============================================================================
# Secrets persist across terraform destroy, causing 409 conflicts on next apply.
# Must delete secrets BEFORE terraform destroy to avoid IAM binding failures.

# Delete a single secret
# Usage: delete_secret <secret_name>
delete_secret() {
    local secret="$1"
    gcloud secrets delete "$secret" --project="$PROJECT" --quiet 2>/dev/null && \
        log_info "Deleted secret: $secret" || true
}

# Delete all known secrets (battle-tested from phoenix-rebuild.sh Gap #2 + Issue #28)
# Usage: delete_persisted_secrets_prod
delete_persisted_secrets_prod() {
    log_info "Deleting persisted GCP secrets (Gap #2 + Issue #28)..."

    # Secret names from configuration variables (if set) or defaults
    # NOTE: mongodb-uri is NOT deleted - it's manually created with MongoDB Atlas
    # connection string and should persist across all rebuilds
    local secrets=(
        "${SECRET_KEYCLOAK_ADMIN_PASSWORD:-${RESOURCE_PREFIX}-keycloak-admin-password}"
        "${SECRET_KEYCLOAK_DB_PASSWORD:-${RESOURCE_PREFIX}-keycloak-db-password}"
        "${SECRET_DB_PASSWORD:-${RESOURCE_PREFIX}-db-password}"
        "${SECRET_CLAUDE_API_KEY:-${RESOURCE_PREFIX}-claude-api-key}"
        "${SECRET_MCP_GATEWAY_CLIENT:-${RESOURCE_PREFIX}-mcp-gateway-client-secret}"
        "${SECRET_JWT:-${RESOURCE_PREFIX}-jwt-secret}"
        "mcp-hr-service-client-secret"
        "prod-user-password"
    )

    for secret in "${secrets[@]}"; do
        delete_secret "$secret"
    done
}

# Delete VPC peering using services API (battle-tested in phoenix-rebuild.sh)
# Issue #14: Service networking peerings MUST use the services API, not compute API
# GCP may take 5-10 minutes to release the peering after Cloud SQL deletion.
# The delete command is rejected (not async) when producer services still hold a
# stale reference, so we must RETRY the delete — not just poll.
# Usage: delete_vpc_peering_robust
delete_vpc_peering_robust() {
    local vpc_name="${NAME_PREFIX}-vpc"

    log_info "Checking for VPC peering on: $vpc_name"

    # Check if service networking peering exists (battle-tested pattern from prod)
    if ! gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT" 2>/dev/null | grep -q "servicenetworking"; then
        log_info "No service networking VPC peering found"
        return 0
    fi

    log_info "Found service networking VPC peering - deleting..."

    # Attempt deletion with retries. GCP rejects the delete (not just slow async)
    # when Cloud SQL internal cleanup hasn't finished. Retry every 30s for up to 10 min.
    local attempt=0
    local max_attempts=20  # 20 * 30s = 10 minutes max
    local delete_output=""

    while true; do
        attempt=$((attempt + 1))

        # Check if peering is already gone
        if ! gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT" 2>/dev/null | grep -q "servicenetworking"; then
            log_info "VPC peering deleted from GCP"
            return 0
        fi

        if [[ $attempt -gt $max_attempts ]]; then
            log_error "VPC peering deletion failed after $max_attempts attempts (10 minutes)"
            log_error "Last error: $delete_output"
            log_error "Manual cleanup required: gcloud services vpc-peerings delete --network=$vpc_name --service=servicenetworking.googleapis.com --project=$PROJECT"
            return 1
        fi

        # Attempt deletion — capture stderr for visibility
        log_info "  VPC peering delete attempt [$attempt/$max_attempts]..."
        delete_output=$(gcloud services vpc-peerings delete \
            --network="$vpc_name" \
            --service=servicenetworking.googleapis.com \
            --project="$PROJECT" \
            --quiet 2>&1) && {
            log_info "VPC peering deletion initiated successfully"
            # Give GCP a moment to process, then verify
            sleep 10
            if ! gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT" 2>/dev/null | grep -q "servicenetworking"; then
                log_info "VPC peering deleted from GCP"
                return 0
            fi
            log_info "  Peering still exists after delete command — waiting for GCP propagation..."
        } || {
            # Delete was rejected — log the reason
            if echo "$delete_output" | grep -q "RESOURCE_PREVENTING_DELETE"; then
                log_warn "  GCP producer service still holds stale reference — retrying in 30s..."
            else
                log_warn "  VPC peering deletion failed: $delete_output"
            fi
        }

        sleep 30
    done
}

# Delete VPC network with retry and dependency cleanup
# Usage: delete_vpc_network_robust
delete_vpc_network_robust() {
    local vpc_name="${NAME_PREFIX}-vpc"
    local max_wait=12  # 2 minutes max
    local wait_count=0

    log_info "Deleting VPC network: $vpc_name"

    while [[ $wait_count -lt $max_wait ]]; do
        # Check if VPC exists
        local vpc_check
        vpc_check=$(gcloud compute networks list \
            --filter="name=$vpc_name" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null || echo "ERROR")

        if [[ "$vpc_check" == "ERROR" ]]; then
            log_warn "GCP API error checking VPC - retrying..."
            sleep 5
            continue
        fi

        if [[ -z "$vpc_check" ]]; then
            log_info "VPC $vpc_name confirmed deleted"
            return 0
        fi

        wait_count=$((wait_count + 1))

        # Force delete any remaining dependencies
        log_info "Cleaning remaining dependencies (attempt $wait_count/$max_wait)..."

        # Force delete remaining firewall rules
        local remaining_fw
        remaining_fw=$(gcloud compute firewall-rules list \
            --filter="network:$vpc_name" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null || true)
        for fw in $remaining_fw; do
            log_info "  Force-deleting firewall rule: $fw"
            gcloud compute firewall-rules delete "$fw" --project="$PROJECT" --quiet 2>/dev/null || true
        done

        # Force delete remaining routes (except default)
        local remaining_routes
        remaining_routes=$(gcloud compute routes list \
            --filter="network:$vpc_name" \
            --format="value(name)" \
            --project="$PROJECT" 2>/dev/null | grep -v "^default-" || true)
        for route in $remaining_routes; do
            log_info "  Force-deleting route: $route"
            gcloud compute routes delete "$route" --project="$PROJECT" --quiet 2>/dev/null || true
        done

        # Force delete remaining subnets
        local remaining_subnets
        remaining_subnets=$(gcloud compute networks subnets list \
            --filter="network:$vpc_name" \
            --format="value(name,region)" \
            --project="$PROJECT" 2>/dev/null || true)
        while IFS=$'\t' read -r subnet_name subnet_region; do
            if [[ -n "$subnet_name" ]]; then
                log_info "  Force-deleting subnet: $subnet_name"
                gcloud compute networks subnets delete "$subnet_name" \
                    --region="${subnet_region##*/}" --project="$PROJECT" --quiet 2>/dev/null || true
            fi
        done <<< "$remaining_subnets"

        # Try to delete VPC
        gcloud compute networks delete "$vpc_name" --project="$PROJECT" --quiet 2>/dev/null || {
            log_info "  VPC deletion pending - waiting for dependencies to clear..."
        }

        sleep 10
    done

    log_error "VPC $vpc_name could not be deleted after $max_wait attempts"
    log_error "Remaining dependencies:"
    gcloud compute networks subnets list --filter="network:$vpc_name" --project="$PROJECT" 2>/dev/null || true
    gcloud compute firewall-rules list --filter="network:$vpc_name" --project="$PROJECT" 2>/dev/null || true
    return 1
}

# =============================================================================
# COMPOSITE FUNCTIONS
# =============================================================================
#
# IMPORTANT: Before calling these functions, set NAME_PREFIX and ENV_ID:
#
#   Primary environment:
#     NAME_PREFIX="tamshai-prod"
#     ENV_ID="primary"
#     pre_destroy_cleanup ""  # Cloud SQL suffix is empty
#
#   Recovery environment:
#     NAME_PREFIX="tamshai-prod-recovery-20260123"
#     ENV_ID="recovery-20260123"
#     pre_destroy_cleanup "-recovery-20260123"  # Cloud SQL suffix

# Run all pre-destroy cleanup (enhanced with Phoenix patterns)
# Usage: pre_destroy_cleanup [cloudsql_suffix] [delete_secrets]
#   cloudsql_suffix: Optional suffix for Cloud SQL (e.g., "-recovery-20260123")
#   delete_secrets: Set to "true" to delete secrets before destroy (Issue #28)
#
# This function performs cleanup BEFORE terraform destroy to prevent common failures:
# - Gap #21: Cloud Run jobs with deletion protection
# - Gap #22: Cloud SQL deletion protection
# - Gap #38: Cloud Run services holding DB connections
# - Issue #28: Secrets and IAM bindings that cause destroy failures
pre_destroy_cleanup() {
    local cloudsql_suffix="${1:-}"
    local delete_secrets="${2:-false}"

    log_info "=== Pre-Destroy Cleanup (NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID) ==="

    # Gap #21: Delete Cloud Run jobs first
    delete_cloud_run_jobs "$cloudsql_suffix"

    # Gap #38: Delete Cloud Run services to release DB connections
    # This allows Cloud SQL to be deleted without "active connections" errors
    log_step "Deleting Cloud Run services to release DB connections (Gap #38)..."
    delete_cloudrun_services
    log_info "Waiting for connections to close..."
    sleep 10

    # Gap #22: Disable Cloud SQL deletion protection
    disable_cloudsql_deletion_protection "$cloudsql_suffix"

    # Issue #28: Delete secrets and remove IAM bindings from state BEFORE destroy
    # This prevents "secret not found" errors during terraform destroy
    if [[ "$delete_secrets" == "true" ]]; then
        log_step "Deleting secrets before destroy (Issue #28)..."
        delete_persisted_secrets_prod

        log_step "Removing secret IAM bindings from terraform state..."
        remove_secret_iam_bindings_state
        remove_secret_state
    fi

    log_info "=== Pre-Destroy Cleanup Complete ==="
}

# Run all post-destroy cleanup
# Usage: post_destroy_cleanup [name_suffix]
#   name_suffix: Optional suffix for Cloud SQL/private IP (e.g., "-recovery-20260123")
post_destroy_cleanup() {
    local name_suffix="${1:-}"

    log_info "=== Post-Destroy Cleanup (NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID) ==="
    delete_cloudsql_instance "$name_suffix"
    delete_cloud_run_jobs "$name_suffix"
    delete_orphaned_private_ip "$name_suffix"  # Same suffix pattern as Cloud SQL
    log_info "=== Post-Destroy Cleanup Complete ==="
}

# Full cleanup of all resources for an environment
# Usage: full_environment_cleanup [name_suffix] [fallback_zones]
#   name_suffix: Optional suffix for Cloud SQL/private IP (e.g., "-recovery-20260123")
#   fallback_zones: Optional space-separated list of zones to check for GCE instances
#   This is the nuclear option - deletes everything for a recovery stack
#
# NAMING PATTERNS (matches Terraform):
#   Cloud Run: NO suffix - same names for prod and DR
#   VPC/networking: NAME_PREFIX (suffix embedded) - "tamshai-prod-recovery-xxx-vpc"
#   Cloud SQL: suffix at end - "tamshai-prod-postgres-recovery-xxx"
#   Private IP: suffix at end - "tamshai-prod-private-ip-recovery-xxx"
#
# ZONE HANDLING (Issue #102): Scans all zones in region for GCE instances,
# including fallback zones used due to capacity issues.
full_environment_cleanup() {
    local name_suffix="${1:-}"
    local fallback_zones="${2:-}"  # Issue #102: Zone capacity fallback support

    log_info "=== Full Environment Cleanup (NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID) ==="
    log_warn "This will delete ALL resources for this environment!"

    # Order matters - delete in dependency order
    # Cloud Run services have NO suffix (same for prod and DR)
    delete_cloudrun_services
    delete_cloud_run_jobs "$name_suffix"

    # Cloud SQL and private IP use suffix at end
    disable_cloudsql_deletion_protection "$name_suffix"
    delete_cloudsql_instance "$name_suffix"

    # VPC resources use NAME_PREFIX (suffix already embedded)
    delete_vpc_connector_and_wait
    delete_vpc_peering_robust
    delete_cloud_nat
    delete_cloud_router
    delete_gce_instances_in_vpc
    # Issue #102: Also scan all zones for orphaned instances (fallback zone support)
    delete_gce_instances_by_pattern "tamshai-${RESOURCE_PREFIX#tamshai-}-*" "$fallback_zones"
    delete_firewall_rules
    delete_vpc_routes
    delete_vpc_subnets
    delete_orphaned_private_ip "$name_suffix"
    delete_vpc_network_robust

    log_info "=== Full Environment Cleanup Complete ==="
}

# =============================================================================
# LEFTOVER RESOURCE CLEANUP (for evacuate-region.sh and phoenix-rebuild.sh)
# =============================================================================
# Cleans up leftover resources from failed deployment attempts.
# This is necessary because:
#   1. Terraform may have created some resources before failing
#   2. A fresh state file doesn't know about these orphaned resources
#   3. Re-running terraform apply will fail with "already exists" errors
#
# Usage:
#   # Set environment first
#   export NAME_PREFIX="tamshai-prod-recovery-20260123"
#   export ENV_ID="recovery-20260123"
#   export GCP_REGION="us-west1"
#   export GCP_PROJECT="my-project"
#
#   # Then call the function
#   cleanup_leftover_resources "-recovery-20260123"
# =============================================================================

# Check if leftover resources exist (VPC is the primary indicator)
# Usage: has_leftover_resources
# Returns: 0 if leftover resources exist, 1 if clean
has_leftover_resources() {
    local vpc_name="${NAME_PREFIX}-vpc"

    if gcloud compute networks describe "$vpc_name" --project="$PROJECT" &>/dev/null 2>&1; then
        return 0  # Found leftover resources
    fi
    return 1  # Clean
}

# Clean up leftover resources from failed deployment attempts
# This is the main function used by evacuate-region.sh and phoenix-rebuild.sh
#
# ZONE HANDLING (Issue #102): This function is zone-agnostic. It scans all zones
# in the region for GCE instances, handling cases where fallback zones were used
# due to capacity issues in the primary zone.
#
# Usage: cleanup_leftover_resources [name_suffix] [state_bucket] [state_prefix] [fallback_zones]
#   name_suffix: Suffix for Cloud SQL/private IP (e.g., "-recovery-20260123")
#   state_bucket: Optional GCS bucket for terraform state lock cleanup
#   state_prefix: Optional GCS prefix for terraform state lock cleanup
#   fallback_zones: Optional space-separated list of zones to check (default: all zones in region)
cleanup_leftover_resources() {
    local name_suffix="${1:-}"
    local state_bucket="${2:-}"
    local state_prefix="${3:-}"
    local fallback_zones="${4:-}"  # Issue #102: Zone capacity fallback support

    log_step "Checking for leftover resources from previous attempts..."
    log_info "NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID"

    if ! has_leftover_resources; then
        log_info "No leftover VPC found - environment is clean"

        # Still check for stale terraform state locks
        if [[ -n "$state_bucket" ]] && [[ -n "$state_prefix" ]]; then
            cleanup_terraform_state_lock "$state_bucket" "$state_prefix"
        fi
        return 0
    fi

    local vpc_name="${NAME_PREFIX}-vpc"
    log_warn "Found leftover VPC: $vpc_name"
    log_info "Cleaning up leftover resources from failed deployment attempt..."

    # =============================================================================
    # DELETION ORDER - Matches Phoenix rebuild phase 3 (Issue #102)
    # =============================================================================
    # The order is critical for avoiding dependency conflicts:
    #   1. Cloud Run jobs & services (release DB connections)
    #   2. Storage buckets (Gap #39 - force_destroy may not work)
    #   3. Cloud SQL + wait (Gap #40 - VPC peering depends on this)
    #   4. VPC peering + wait (Issue #14 - private IP depends on this)
    #   5. Private IPs (Gap #24)
    #   6. Cloud NAT & Router
    #   7. VPC connector + wait (Gap #25 - takes 2-3 min, blocks subnet)
    #   8. GCE instances, firewall rules, subnets, routes
    #   9. VPC network (must be last)
    # =============================================================================

    # Step 1: Delete Cloud Run jobs
    log_step "Deleting leftover Cloud Run jobs..."
    delete_cloud_run_jobs "$name_suffix"

    # Step 2: Delete Cloud Run services (release DB connections)
    # NOTE: Cloud Run services have NO suffix
    log_step "Deleting leftover Cloud Run services..."
    delete_cloudrun_services
    log_info "Waiting for DB connections to close..."
    sleep 5

    # Step 3: Empty storage buckets (Gap #39 - force_destroy may not work)
    log_step "Emptying storage buckets (Gap #39)..."
    empty_all_storage_buckets

    # Step 4: Delete Cloud SQL instance + wait (Gap #40 + Issue #14)
    log_step "Deleting leftover Cloud SQL instances..."
    disable_cloudsql_deletion_protection "$name_suffix"

    local sql_instance="${RESOURCE_PREFIX}-postgres${name_suffix}"
    if gcloud sql instances describe "$sql_instance" --project="$PROJECT" &>/dev/null 2>&1; then
        log_info "Deleting Cloud SQL: $sql_instance..."
        gcloud sql instances delete "$sql_instance" --project="$PROJECT" --quiet 2>/dev/null || true

        # Wait for Cloud SQL deletion (VPC peering cannot be deleted until Cloud SQL is gone)
        local sql_wait=0
        local sql_max_wait=18  # 3 minutes max
        while gcloud sql instances describe "$sql_instance" --project="$PROJECT" &>/dev/null 2>&1; do
            sql_wait=$((sql_wait + 1))
            if [[ $sql_wait -ge $sql_max_wait ]]; then
                log_warn "Cloud SQL deletion timeout - continuing anyway"
                break
            fi
            log_info "  Waiting for Cloud SQL deletion... [$sql_wait/$sql_max_wait]"
            sleep 10
        done
    fi

    # Step 5: Delete VPC peering + wait (Issue #14 - must be before private IP)
    log_step "Deleting leftover VPC peering..."
    delete_vpc_peering_robust || log_warn "VPC peering deletion may have failed"

    # Step 6: Delete private IP addresses (Gap #24 - after VPC peering)
    log_step "Deleting leftover private IP addresses..."
    delete_orphaned_private_ip "$name_suffix"

    # Step 7: Delete Cloud NAT
    log_step "Deleting leftover Cloud NAT..."
    delete_cloud_nat

    # Step 8: Delete Cloud Router
    log_step "Deleting leftover Cloud Router..."
    delete_cloud_router

    # Step 9: Delete VPC Access Connector + wait (Gap #25 - takes 2-3 min, blocks subnet)
    # NOTE: Moved AFTER Cloud NAT/Router per Phoenix order (connector blocks subnet deletion)
    log_step "Deleting leftover VPC connectors..."
    delete_vpc_connector_and_wait || {
        log_error "VPC connector deletion failed - cannot proceed"
        return 1
    }

    # Step 10: Delete GCE instances using the target subnet
    log_step "Deleting GCE instances using target VPC subnet..."
    delete_gce_instances_in_vpc

    # Step 10.5: Fallback - scan all zones for orphaned instances by name pattern
    # Issue #102: Handle instances in fallback zones or with broken subnet references
    log_step "Scanning all zones for orphaned GCE instances..."
    delete_gce_instances_by_pattern "tamshai-${RESOURCE_PREFIX#tamshai-}-*" "$fallback_zones"

    # Step 11: Delete firewall rules
    log_step "Deleting leftover firewall rules..."
    delete_firewall_rules

    # Step 12: Delete subnets
    log_step "Deleting leftover subnets..."
    delete_vpc_subnets

    # Step 13: Delete routes (can block VPC deletion)
    log_step "Deleting leftover routes..."
    delete_vpc_routes

    # Step 14: Delete VPC network (last - everything else must be deleted first)
    log_step "Deleting leftover VPC network..."
    delete_vpc_network_robust || {
        log_error "VPC deletion failed"
        log_error "Cannot proceed with deployment while leftover VPC exists"
        log_error "Manual cleanup may be required, then re-run this script"
        return 1
    }

    log_success "Leftover resources cleaned up"

    # Clean up stale terraform state locks
    if [[ -n "$state_bucket" ]] && [[ -n "$state_prefix" ]]; then
        cleanup_terraform_state_lock "$state_bucket" "$state_prefix"
    fi

    return 0
}

# Clean up stale terraform state lock (enhanced with Phoenix patterns)
# Usage: cleanup_terraform_state_lock <bucket> <prefix>
#
# This function handles stale terraform locks that can occur when:
# - A previous terraform operation was interrupted
# - Network issues caused a lock to not be released
# - Manual cleanup is needed after a failed deployment
cleanup_terraform_state_lock() {
    local bucket="$1"
    local prefix="$2"

    log_step "Checking for stale terraform state locks..."
    local lock_file="gs://${bucket}/${prefix}/default.tflock"

    if gcloud storage cat "$lock_file" &>/dev/null 2>&1; then
        log_warn "Found stale lock file in GCS - attempting cleanup..."

        # Phoenix pattern: Extract lock ID and use terraform force-unlock first
        local lock_id
        lock_id=$(gcloud storage cat "$lock_file" 2>/dev/null | grep -o '"ID":"[0-9]*"' | grep -o '[0-9]*' | head -1) || true

        if [[ -n "$lock_id" ]]; then
            log_info "  Found lock ID: $lock_id"
            log_info "  Running terraform force-unlock..."
            terraform force-unlock -force "$lock_id" 2>/dev/null || log_warn "Force unlock may have failed"
        fi

        # Also delete the lock file directly as backup (in case force-unlock didn't work)
        log_info "  Removing lock file from GCS..."
        gcloud storage rm "$lock_file" 2>/dev/null || true

        log_info "Terraform state lock cleanup complete"
    else
        log_info "No stale terraform state lock found"
    fi
}

echo "[cleanup] Library loaded (RESOURCE_PREFIX=$RESOURCE_PREFIX, NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID)"
