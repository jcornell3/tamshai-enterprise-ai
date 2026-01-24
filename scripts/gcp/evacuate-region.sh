#!/bin/bash
# =============================================================================
# Regional Evacuation - GCP Production Environment
# =============================================================================
#
# Evacuates the production stack to a new region during a regional outage.
# Uses the "Amnesia" approach: creates a fresh Terraform state in the target
# region, bypassing the unreachable primary region entirely.
#
# This script is designed for scenarios where us-central1 is completely
# unavailable and terraform destroy/apply would hang.
#
# Usage:
#   ./evacuate-region.sh [OPTIONS] [NEW_REGION] [NEW_ZONE] [ENV_ID]
#
# Options:
#   --yes, -y           Skip interactive confirmations (for automated runs)
#   --region=REGION     Target region (default: from dr.tfvars or us-west1)
#   --zone=ZONE         Target zone (default: from dr.tfvars or REGION-b)
#   --env-id=ID         Environment ID (default: recovery-YYYYMMDD-HHMM)
#   --tfvars=FILE       Use custom tfvars file (default: environments/dr.tfvars)
#   -h, --help          Show this help message
#
# Configuration Priority:
#   CLI args > Environment vars > tfvars > hardcoded defaults
#
# Environment Variables:
#   GCP_DR_REGION, GCP_DR_ZONE       - Override target region/zone
#   GCP_DR_FALLBACK_ZONES            - Space-separated fallback zones for capacity issues
#   KEYCLOAK_DR_DOMAIN               - Override Keycloak domain
#   GCP_SA_*, GCP_SECRET_*           - Override service account/secret names
#
# Examples:
#   ./evacuate-region.sh                                    # Uses dr.tfvars defaults
#   ./evacuate-region.sh us-west1 us-west1-b recovery-01    # Specific region and ID
#   ./evacuate-region.sh us-east1 us-east1-b                # East coast, auto-generated ID
#   ./evacuate-region.sh --yes us-west1 us-west1-b test-01  # Skip confirmation
#   GCP_DR_REGION=us-east1 ./evacuate-region.sh             # Override via env var
#
# Priority Regions (same cost as us-central1):
#   1. us-west1 (Oregon)    - Recommended: No hurricane risk, closest to CA team
#   2. us-east1 (S. Carolina) - Hurricane zone (June-Nov)
#   3. us-east5 (Ohio)       - Newer region
#
# See: docs/plans/GCP-REGION-FAILURE-SCENARIO.md
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# =============================================================================
# SOURCE PHOENIX LIBRARIES (Issue #25, #34: Proven patterns for GCP operations)
# =============================================================================
# These libraries contain battle-tested functions from 11 Phoenix rebuilds:
# - health-checks.sh: wait_for_cloudsql, wait_for_keycloak, submit_and_wait_build
# - secrets.sh: GCP Secret Manager operations
# - dynamic-urls.sh: Service URL discovery
# =============================================================================

# Default GCP configuration (needed by libraries)
export GCP_REGION="${GCP_REGION:-us-central1}"
export GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

# Source libraries with graceful fallback
# Note: common.sh provides logging functions - inline definitions below serve as fallback
# Issue #102: cleanup.sh and domain-mapping.sh provide reusable functions for DR
if [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
    source "$SCRIPT_DIR/lib/common.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/cleanup.sh" ]; then
    source "$SCRIPT_DIR/lib/cleanup.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/health-checks.sh" ]; then
    source "$SCRIPT_DIR/lib/health-checks.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/domain-mapping.sh" ]; then
    source "$SCRIPT_DIR/lib/domain-mapping.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/secrets.sh" ]; then
    source "$SCRIPT_DIR/lib/secrets.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/dynamic-urls.sh" ]; then
    source "$SCRIPT_DIR/lib/dynamic-urls.sh" 2>/dev/null || true
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Terraform directory (needed for tfvars loading)
TF_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"
TFVARS_DIR="$TF_DIR/environments"

# =============================================================================
# TFVARS CONFIGURATION LOADING
# =============================================================================
# Load configuration from dr.tfvars to avoid hardcoded values.
# Values can be overridden by command-line arguments or environment variables.
# Priority: CLI args > Environment vars > tfvars > defaults
# =============================================================================

load_tfvars_config() {
    local tfvars_file="${TFVARS_DIR}/dr.tfvars"

    if [ ! -f "$tfvars_file" ]; then
        log_warn "DR tfvars not found: $tfvars_file"
        log_info "Using default configuration values"
        return 1
    fi

    log_info "Loading configuration from: $tfvars_file"

    # Load region configuration
    TFVAR_REGION=$(get_tfvar "region" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_ZONE=$(get_tfvar "zone" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_KEYCLOAK_DOMAIN=$(get_tfvar "keycloak_domain" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_BACKUP_BUCKET=$(get_tfvar "source_backup_bucket" "$tfvars_file" 2>/dev/null || echo "")

    # Load fallback zones (Issue #102: Zone capacity resilience)
    # Format in tfvars: fallback_zones = ["us-west1-a", "us-west1-c"]
    TFVAR_FALLBACK_ZONES=$(grep -E '^fallback_zones\s*=' "$tfvars_file" 2>/dev/null | \
        sed 's/.*=\s*//' | tr -d '[]"' | tr ',' ' ' || echo "")

    return 0
}

# Defaults (will be overridden by tfvars if available)
NEW_REGION=""
NEW_ZONE=""
ENV_ID=""
AUTO_YES=false  # Skip interactive confirmations

# Parse arguments first (supports both positional and flags)
POSITIONAL_ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) AUTO_YES=true; shift ;;
        --region=*) NEW_REGION="${1#*=}"; shift ;;
        --zone=*) NEW_ZONE="${1#*=}"; shift ;;
        --env-id=*) ENV_ID="${1#*=}"; shift ;;
        --tfvars=*) TFVARS_FILE="${1#*=}"; shift ;;
        -h|--help) head -27 "$0" | tail -22; exit 0 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *) POSITIONAL_ARGS+=("$1"); shift ;;
    esac
done

# Handle positional arguments for backwards compatibility
# Usage: ./evacuate-region.sh [REGION] [ZONE] [ENV_ID]
if [ ${#POSITIONAL_ARGS[@]} -ge 1 ]; then NEW_REGION="${POSITIONAL_ARGS[0]}"; fi
if [ ${#POSITIONAL_ARGS[@]} -ge 2 ]; then NEW_ZONE="${POSITIONAL_ARGS[1]}"; fi
if [ ${#POSITIONAL_ARGS[@]} -ge 3 ]; then ENV_ID="${POSITIONAL_ARGS[2]}"; fi

# Load tfvars configuration (provides defaults for values not set via CLI)
load_tfvars_config || true

# Apply configuration priority: CLI args > Environment vars > tfvars > hardcoded defaults
# Region: CLI > GCP_DR_REGION env > tfvars > us-west1
NEW_REGION="${NEW_REGION:-${GCP_DR_REGION:-${TFVAR_REGION:-us-west1}}}"
# Zone: CLI > GCP_DR_ZONE env > tfvars > region-b
NEW_ZONE="${NEW_ZONE:-${GCP_DR_ZONE:-${TFVAR_ZONE:-${NEW_REGION}-b}}}"
# Keycloak domain: CLI > KEYCLOAK_DR_DOMAIN env > tfvars > auth-dr.tamshai.com
KEYCLOAK_DR_DOMAIN="${KEYCLOAK_DR_DOMAIN:-${TFVAR_KEYCLOAK_DOMAIN:-auth-dr.tamshai.com}}"
# Keycloak realm: env var > default
KEYCLOAK_REALM="${KEYCLOAK_REALM:-tamshai-corp}"

# ENV_ID: CLI > auto-generated timestamp
ENV_ID="${ENV_ID:-recovery-$(date +%Y%m%d-%H%M)}"

# GCP Configuration
PROJECT_ID="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

# Bucket names: Environment vars > derived from project
STATE_BUCKET="${GCP_STATE_BUCKET:-tamshai-terraform-state-prod}"
BACKUP_BUCKET="${TFVAR_BACKUP_BUCKET:-${GCP_BACKUP_BUCKET:-tamshai-backups-us}}"

# Service account names: Environment vars > defaults
SA_KEYCLOAK="${GCP_SA_KEYCLOAK:-tamshai-prod-keycloak}"
SA_MCP_GATEWAY="${GCP_SA_MCP_GATEWAY:-tamshai-prod-mcp-gateway}"
SA_MCP_SERVERS="${GCP_SA_MCP_SERVERS:-tamshai-prod-mcp-servers}"
SA_CICD="${GCP_SA_CICD:-tamshai-prod-cicd}"
SA_PROVISION="${GCP_SA_PROVISION:-tamshai-prod-provision}"

# GCP Secret Manager secret names: Environment vars > defaults
SECRET_KEYCLOAK_ADMIN_PASSWORD="${GCP_SECRET_KEYCLOAK_ADMIN_PASSWORD:-tamshai-prod-keycloak-admin-password}"
SECRET_KEYCLOAK_DB_PASSWORD="${GCP_SECRET_KEYCLOAK_DB_PASSWORD:-tamshai-prod-keycloak-db-password}"
SECRET_DB_PASSWORD="${GCP_SECRET_DB_PASSWORD:-tamshai-prod-db-password}"
SECRET_CLAUDE_API_KEY="${GCP_SECRET_CLAUDE_API_KEY:-tamshai-prod-anthropic-api-key}"
SECRET_MCP_GATEWAY_CLIENT="${GCP_SECRET_MCP_GATEWAY_CLIENT:-tamshai-prod-mcp-gateway-client-secret}"
SECRET_JWT="${GCP_SECRET_JWT:-tamshai-prod-jwt-secret}"
SECRET_MCP_HR_CLIENT="${GCP_SECRET_MCP_HR_CLIENT:-mcp-hr-service-client-secret}"
SECRET_PROD_USER_PASSWORD="${GCP_SECRET_PROD_USER_PASSWORD:-prod-user-password}"

# Fallback zones for capacity issues (Issue #102)
# Environment var > tfvars > region-based defaults
# Format: space-separated list of zones to try if primary zone fails
if [ -n "$GCP_DR_FALLBACK_ZONES" ]; then
    FALLBACK_ZONES="$GCP_DR_FALLBACK_ZONES"
elif [ -n "$TFVAR_FALLBACK_ZONES" ]; then
    FALLBACK_ZONES="$TFVAR_FALLBACK_ZONES"
else
    # Default fallback zones based on region
    case "$NEW_REGION" in
        us-west1)  FALLBACK_ZONES="${NEW_REGION}-a ${NEW_REGION}-c" ;;
        us-east1)  FALLBACK_ZONES="${NEW_REGION}-b ${NEW_REGION}-c ${NEW_REGION}-d" ;;
        us-east5)  FALLBACK_ZONES="${NEW_REGION}-a ${NEW_REGION}-b ${NEW_REGION}-c" ;;
        *)         FALLBACK_ZONES="${NEW_REGION}-a ${NEW_REGION}-c" ;;
    esac
fi

# Colors and logging (fallback if common.sh not loaded)
# These are overwritten when lib/common.sh is sourced successfully
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_phase() { echo -e "\n${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"; echo -e "${MAGENTA}  PHASE $1: $2${NC}"; echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# ZONE CAPACITY CHECK (Issue #102)
# =============================================================================
# GCP zones can have transient capacity issues for specific machine types.
# This function checks if a machine type is available in a zone before deployment.
#
# Returns: 0 if zone has capacity, 1 if unavailable
# =============================================================================

check_zone_capacity() {
    local zone="$1"
    local machine_type="${2:-e2-micro}"

    # Check if machine type is available in the zone
    # This uses gcloud compute machine-types describe which returns an error if unavailable
    if gcloud compute machine-types describe "$machine_type" \
        --zone="$zone" \
        --project="$PROJECT_ID" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Select a zone with available capacity from the fallback list
# Updates NEW_ZONE global variable with the first available zone
select_available_zone() {
    local machine_type="${1:-e2-micro}"
    local zones_to_check="$NEW_ZONE $FALLBACK_ZONES"

    log_step "Checking zone capacity for $machine_type..."

    for zone in $zones_to_check; do
        log_info "  Checking $zone..."
        if check_zone_capacity "$zone" "$machine_type"; then
            if [ "$zone" != "$NEW_ZONE" ]; then
                log_warn "Primary zone $NEW_ZONE unavailable, using fallback: $zone"
                NEW_ZONE="$zone"
            fi
            log_success "Zone $zone has capacity for $machine_type"
            return 0
        else
            log_warn "  Zone $zone: $machine_type unavailable"
        fi
    done

    log_error "No zones with $machine_type capacity found!"
    log_error "Zones checked: $zones_to_check"
    log_error "Try a different region or wait for capacity to become available"
    return 1
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

preflight_checks() {
    log_phase "0" "PRE-FLIGHT CHECKS"

    local errors=0

    # Check required tools
    log_step "Checking required tools..."
    for tool in gcloud terraform gh jq curl; do
        if ! command -v $tool &>/dev/null; then
            log_error "Missing required tool: $tool"
            ((errors++))
        fi
    done

    # Check GCP authentication
    log_step "Checking GCP authentication..."
    if ! gcloud auth print-access-token &>/dev/null; then
        log_error "GCP authentication failed. Run: gcloud auth login"
        ((errors++))
    fi

    # Check project ID
    log_step "Checking GCP project..."
    if [ -z "$PROJECT_ID" ]; then
        log_error "GCP project not set. Run: gcloud config set project <PROJECT_ID>"
        ((errors++))
    else
        log_info "Project: $PROJECT_ID"
    fi

    # Check GitHub CLI authentication
    log_step "Checking GitHub CLI authentication..."
    if ! gh auth status &>/dev/null; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        ((errors++))
    fi

    # Validate target region exists
    log_step "Validating target region: $NEW_REGION..."
    if ! gcloud compute regions describe "$NEW_REGION" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Invalid GCP region: $NEW_REGION"
        ((errors++))
    fi

    # Validate target zone exists and has capacity (Issue #102)
    log_step "Validating target zone: $NEW_ZONE..."
    if ! gcloud compute zones describe "$NEW_ZONE" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Invalid GCP zone: $NEW_ZONE"
        ((errors++))
    else
        # Check zone capacity for e2-micro (used by utility VM)
        # This will update NEW_ZONE to a fallback if needed
        if ! select_available_zone "e2-micro"; then
            log_error "No zone with e2-micro capacity available"
            ((errors++))
        else
            log_info "Using zone: $NEW_ZONE"
        fi
    fi

    if [ $errors -gt 0 ]; then
        log_error "Pre-flight checks failed with $errors error(s)"
        exit 1
    fi

    log_success "All pre-flight checks passed"
}

# =============================================================================
# CONFIRMATION
# =============================================================================

confirm_evacuation() {
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                    REGIONAL EVACUATION SUMMARY                    ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}Target Configuration:${NC}"
    echo -e "  Target Region:     ${CYAN}$NEW_REGION${NC}"
    echo -e "  Target Zone:       ${CYAN}$NEW_ZONE${NC}"
    echo -e "  Environment ID:    ${CYAN}$ENV_ID${NC}"
    echo -e "  State Prefix:      ${CYAN}gcp/recovery/$ENV_ID${NC}"
    echo -e "  Project:           ${CYAN}$PROJECT_ID${NC}"
    echo ""
    echo -e "  ${BLUE}Keycloak Configuration:${NC}"
    echo -e "  DR Domain:         ${CYAN}$KEYCLOAK_DR_DOMAIN${NC}"
    echo -e "  Realm:             ${CYAN}$KEYCLOAK_REALM${NC}"
    echo ""
    echo -e "  ${BLUE}Infrastructure:${NC}"
    echo -e "  State Bucket:      ${CYAN}$STATE_BUCKET${NC}"
    echo -e "  Backup Bucket:     ${CYAN}$BACKUP_BUCKET${NC}"
    echo ""
    echo -e "${YELLOW}This will create a NEW production stack in $NEW_REGION.${NC}"
    echo -e "${YELLOW}The primary stack (if still running) will NOT be affected.${NC}"
    echo ""

    if [ "$AUTO_YES" = "true" ]; then
        log_info "Auto-confirming (--yes flag provided)"
        return 0
    fi

    read -p "Proceed with regional evacuation? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Evacuation cancelled"
        exit 0
    fi
}

# =============================================================================
# PRE-CLEANUP: REMOVE LEFTOVER RESOURCES FROM FAILED ATTEMPTS
# =============================================================================
# Uses the common cleanup library (lib/cleanup.sh) to remove any leftover GCP
# resources from previous failed evacuation attempts.
#
# This is necessary because:
# 1. Terraform may have created some resources before failing
# 2. The fresh state file doesn't know about these orphaned resources
# 3. Re-running terraform apply will fail with "already exists" errors
#
# The library function handles all resource types in the correct dependency order.
# =============================================================================

run_cleanup_leftover_resources() {
    log_phase "0.5" "PRE-CLEANUP: REMOVE LEFTOVER RESOURCES"

    local name_suffix="-${ENV_ID}"

    # Set up environment for library functions
    # NAME_PREFIX includes suffix for VPC naming: tamshai-prod-recovery-xxx
    # ENV_ID is just the ID part: recovery-xxx
    export NAME_PREFIX="tamshai-prod${name_suffix}"
    export RESOURCE_PREFIX="tamshai-prod"
    export ENV_ID="${ENV_ID}"
    export GCP_REGION="${NEW_REGION}"
    export GCP_PROJECT="${PROJECT_ID}"
    export REGION="${NEW_REGION}"
    export PROJECT="${PROJECT_ID}"

    log_info "Cleanup configuration:"
    log_info "  NAME_PREFIX: $NAME_PREFIX"
    log_info "  ENV_ID: $ENV_ID"
    log_info "  name_suffix: $name_suffix"
    log_info "  FALLBACK_ZONES: $FALLBACK_ZONES"

    # Call the library function
    # Arguments: name_suffix, state_bucket, state_prefix, fallback_zones
    # Issue #102: Pass fallback zones for comprehensive instance cleanup across zones
    if type cleanup_leftover_resources &>/dev/null; then
        cleanup_leftover_resources "$name_suffix" "$STATE_BUCKET" "gcp/recovery/${ENV_ID}" "$FALLBACK_ZONES" || {
            log_error "Cleanup failed - cannot proceed with evacuation"
            exit 1
        }
    else
        log_error "cleanup_leftover_resources function not found - is lib/cleanup.sh loaded?"
        log_error "Falling back to manual VPC check only..."

        local vpc_name="${NAME_PREFIX}-vpc"
        if gcloud compute networks describe "$vpc_name" --project="$PROJECT_ID" &>/dev/null; then
            log_error "Found leftover VPC: $vpc_name"
            log_error "Library not loaded - cannot clean up automatically"
            log_error "Please ensure lib/cleanup.sh is available and re-run"
            exit 1
        fi
        log_info "No leftover VPC found - environment is clean"
    fi
}

# =============================================================================
# PHASE 1: INITIALIZE FRESH TERRAFORM STATE
# =============================================================================

phase1_init_state() {
    log_phase "1" "INITIALIZE FRESH TERRAFORM STATE"

    cd "$TF_DIR"

    log_step "Initializing Terraform with recovery state path..."
    log_info "State bucket: $STATE_BUCKET"
    log_info "State prefix: gcp/recovery/$ENV_ID"

    # Clean up local .terraform directory before switching backends
    # This is required because:
    # 1. We're switching to a different GCS state path (recovery vs primary)
    # 2. Local .terraform/terraform.tfstate contains cached backend config
    # 3. Windows may hold file locks from interrupted terraform processes
    # 4. The actual state is safely stored in GCS, not locally
    if [ -d ".terraform" ]; then
        log_info "Removing local .terraform directory (switching backends)..."
        rm -rf .terraform
    fi

    # Use -reconfigure to completely reinitialize with new backend
    terraform init -reconfigure \
        -backend-config="bucket=$STATE_BUCKET" \
        -backend-config="prefix=gcp/recovery/$ENV_ID"

    # Clean up stale state entries from previous failed attempts
    # The pre-cleanup phase deleted actual resources, but the state may still reference them
    log_step "Cleaning up stale state entries from previous attempts..."
    local stale_resources
    stale_resources=$(terraform state list 2>/dev/null || echo "")

    if [ -n "$stale_resources" ]; then
        log_info "  Found $(echo "$stale_resources" | wc -l) resources in state from previous attempt"
        log_info "  Removing stale entries for resources deleted during cleanup..."

        # Remove database resources (Cloud SQL was deleted during cleanup)
        for resource in module.database.google_sql_database_instance.postgres \
                        module.database.google_sql_database.keycloak_db \
                        module.database.google_sql_database.hr_db \
                        module.database.google_sql_database.finance_db \
                        module.database.google_sql_user.keycloak_user \
                        module.database.google_sql_user.tamshai_user \
                        module.database.google_compute_global_address.private_ip_range \
                        module.database.google_service_networking_connection.private_vpc_connection; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # Remove networking resources (VPC was deleted during cleanup)
        for resource in module.networking.google_compute_network.vpc \
                        module.networking.google_compute_subnetwork.subnet \
                        module.networking.google_compute_router.router \
                        module.networking.google_compute_router_nat.nat \
                        module.networking.google_vpc_access_connector.serverless_connector[0] \
                        'module.networking.google_vpc_access_connector.serverless_connector[0]' \
                        module.networking.google_compute_firewall.allow_http \
                        module.networking.google_compute_firewall.allow_iap_ssh \
                        module.networking.google_compute_firewall.allow_internal \
                        module.networking.google_compute_firewall.allow_serverless_connector[0] \
                        'module.networking.google_compute_firewall.allow_serverless_connector[0]'; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # Remove Cloud Run resources (deleted during cleanup)
        for resource in module.cloudrun.google_cloud_run_service.keycloak \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["support"]' \
                        module.cloudrun.google_cloud_run_service.web_portal[0] \
                        'module.cloudrun.google_cloud_run_service.web_portal[0]' \
                        module.cloudrun.google_artifact_registry_repository.tamshai; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # NOTE: Storage buckets are SHARED between primary and recovery (no suffix)
        # They don't need to be removed from state - they should be imported instead
        # See gcp/main.tf comment: storage buckets are global and should be reused

        log_success "  Stale state entries removed"
    else
        log_info "  State is clean (no previous entries found)"
    fi

    log_success "Terraform initialized with fresh state"
}

# =============================================================================
# PHASE 1.5: REPLICATE CONTAINER IMAGES TO RECOVERY REGION
# =============================================================================
# Artifact Registry is regional, so images built for us-central1 are not available
# in us-west1. We must copy images from the primary region to the recovery region
# before deploying Cloud Run services.
# =============================================================================

phase1_5_replicate_images() {
    log_phase "1.5" "REPLICATE CONTAINER IMAGES TO RECOVERY REGION"

    local PRIMARY_REGION="${GCP_REGION:-us-central1}"  # Where images currently exist
    local SOURCE_REGISTRY="${PRIMARY_REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai"
    local TARGET_REGISTRY="${NEW_REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai"

    log_info "Source registry: $SOURCE_REGISTRY"
    log_info "Target registry: $TARGET_REGISTRY"

    # First, ensure the Artifact Registry repository exists in the new region
    log_step "Creating Artifact Registry repository in $NEW_REGION..."
    if ! gcloud artifacts repositories describe tamshai \
        --location="$NEW_REGION" \
        --project="$PROJECT_ID" &>/dev/null 2>&1; then
        gcloud artifacts repositories create tamshai \
            --repository-format=docker \
            --location="$NEW_REGION" \
            --project="$PROJECT_ID" \
            --description="Tamshai container images for regional evacuation"
        log_success "  Created Artifact Registry repository in $NEW_REGION"
    else
        log_info "  Artifact Registry repository already exists in $NEW_REGION"
    fi

    # List of images to replicate
    local images=(
        "keycloak:v2.0.0-postgres"
        "mcp-gateway:latest"
        "mcp-hr:latest"
        "mcp-finance:latest"
        "mcp-sales:latest"
        "mcp-support:latest"
        "web-portal:latest"
        "provision-job:latest"
    )

    log_step "Copying container images to recovery region..."
    local failed_images=()

    for image in "${images[@]}"; do
        local source_image="${SOURCE_REGISTRY}/${image}"
        local target_image="${TARGET_REGISTRY}/${image}"
        local image_name="${image%:*}"
        local image_tag="${image#*:}"
        local copy_success=false

        log_info "  Copying: $image"

        # Check if target image already exists (skip if already copied)
        if gcloud artifacts docker images describe "$target_image" \
            --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "    Already exists in target registry (skipping)"
            continue
        fi

        # Check if source image exists
        if gcloud artifacts docker images describe "$source_image" \
            --project="$PROJECT_ID" &>/dev/null 2>&1; then
            # Source exists, try to copy

            # Try gcrane first (fastest, preserves manifests)
            if command -v gcrane &>/dev/null; then
                if gcrane copy "$source_image" "$target_image" 2>/dev/null; then
                    log_success "    Copied via gcrane"
                    copy_success=true
                else
                    log_warn "    gcrane copy failed, trying docker method..."
                fi
            fi

            # Fallback to docker pull/tag/push
            if [ "$copy_success" = false ]; then
                if copy_image_via_docker "$source_image" "$target_image"; then
                    copy_success=true
                fi
            fi
        else
            log_warn "    Source image not found, will attempt rebuild..."
        fi

        # =================================================================
        # REBUILD FALLBACK (Phoenix pattern Gaps #55-58)
        # Rebuild in target region if copy fails. Each image type has
        # different build requirements documented in phoenix-rebuild.sh.
        # =================================================================
        if [ "$copy_success" = false ]; then
            log_warn "  Copy failed, attempting rebuild in target region..."

            case "$image_name" in
                keycloak)
                    # Keycloak uses Dockerfile.cloudbuild (no BuildKit syntax)
                    # Phoenix pattern: Use --config with temp cloudbuild.yaml (--dockerfile flag doesn't exist)
                    log_info "    Building keycloak (Dockerfile.cloudbuild)..."
                    local keycloak_config="/tmp/keycloak-cloudbuild-$$.yaml"
                    cat > "$keycloak_config" <<KEYCLOAK_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${target_image}', '-f', 'Dockerfile.cloudbuild', '.']
images:
  - '${target_image}'
KEYCLOAK_EOF
                    if gcloud builds submit "${PROJECT_ROOT}/keycloak" \
                        --config="$keycloak_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt keycloak successfully"
                        copy_success=true
                    fi
                    rm -f "$keycloak_config"
                    ;;
                web-portal)
                    # Web portal needs repo root context with Dockerfile.prod
                    # Phoenix pattern: Use --config with temp cloudbuild.yaml
                    log_info "    Building web-portal (Dockerfile.prod from repo root)..."
                    local webportal_config="/tmp/webportal-cloudbuild-$$.yaml"
                    cat > "$webportal_config" <<WEBPORTAL_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${target_image}', '-f', 'clients/web/Dockerfile.prod', '.']
images:
  - '${target_image}'
WEBPORTAL_EOF
                    if gcloud builds submit "${PROJECT_ROOT}" \
                        --config="$webportal_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt web-portal successfully"
                        copy_success=true
                    fi
                    rm -f "$webportal_config"
                    ;;
                mcp-gateway|mcp-hr|mcp-finance|mcp-sales|mcp-support)
                    # Standard MCP services - can use --tag directly
                    log_info "    Building ${image_name} (standard Dockerfile)..."
                    if gcloud builds submit "${PROJECT_ROOT}/services/${image_name}" \
                        --tag="$target_image" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt ${image_name} successfully"
                        copy_success=true
                    fi
                    ;;
                provision-job)
                    # Provision job is at scripts/gcp/provision-job/
                    # Phoenix pattern: Use minimal build context with --config
                    log_info "    Building provision-job..."
                    local provision_context="/tmp/provision-job-context-$$"
                    mkdir -p "$provision_context/services" "$provision_context/sample-data" "$provision_context/scripts/gcp"
                    cp -r "$PROJECT_ROOT/services/mcp-hr" "$provision_context/services/"
                    cp "$PROJECT_ROOT/sample-data"/*.sql "$provision_context/sample-data/" 2>/dev/null || true
                    cp -r "$PROJECT_ROOT/scripts/gcp/provision-job" "$provision_context/scripts/gcp/"

                    local provision_config="/tmp/provision-cloudbuild-$$.yaml"
                    cat > "$provision_config" <<PROVISION_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${target_image}', '-f', 'scripts/gcp/provision-job/Dockerfile', '.']
images:
  - '${target_image}'
PROVISION_EOF
                    if gcloud builds submit "$provision_context" \
                        --config="$provision_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt provision-job successfully"
                        copy_success=true
                    fi
                    rm -rf "$provision_context" "$provision_config"
                    ;;
                *)
                    log_warn "    Unknown image type, cannot rebuild: $image_name"
                    ;;
            esac
        fi

        if [ "$copy_success" = false ]; then
            log_error "  Failed to copy or rebuild: $image"
            failed_images+=("$image")
        fi
    done

    if [ ${#failed_images[@]} -gt 0 ]; then
        log_warn "Some images could not be copied: ${failed_images[*]}"
        log_warn "Cloud Run services may fail to deploy until images are available"
    else
        log_success "All container images copied to recovery region"
    fi
}

# Helper function to copy images using docker commands
# Issue #34: Added better error handling and debugging output
copy_image_via_docker() {
    local source=$1
    local target=$2

    # Configure docker for Artifact Registry (both source and target regions)
    local primary_region="${GCP_REGION:-us-central1}"
    log_info "    Configuring docker for ${primary_region}-docker.pkg.dev..."
    gcloud auth configure-docker "${primary_region}-docker.pkg.dev" --quiet 2>/dev/null || true
    log_info "    Configuring docker for ${NEW_REGION}-docker.pkg.dev..."
    gcloud auth configure-docker "${NEW_REGION}-docker.pkg.dev" --quiet 2>/dev/null || true

    # Pull with verbose output for debugging
    log_info "    Pulling: $source"
    if ! docker pull "$source" 2>&1; then
        log_error "    Failed to pull image: $source"
        log_error "    Check if the image exists and auth is configured correctly"
        return 1
    fi

    # Tag for target registry
    log_info "    Tagging: $target"
    if ! docker tag "$source" "$target" 2>&1; then
        log_error "    Failed to tag image"
        return 1
    fi

    # Push to target registry
    log_info "    Pushing: $target"
    if ! docker push "$target" 2>&1; then
        log_error "    Failed to push image to target registry"
        return 1
    fi

    log_success "    Copied via docker pull/tag/push"
    return 0
}

# =============================================================================
# PHASE 2: DEPLOY INFRASTRUCTURE TO NEW REGION
# =============================================================================
# Similar to phoenix-rebuild.sh phase_7_cloud_run, this phase handles 409
# "already exists" errors by importing existing resources into the new state.
#
# Service accounts and secrets are project-global (not region-specific), so
# when running a recovery stack in parallel with production:
# - Service accounts: Import existing ones (they're reusable across regions)
# - Secrets: Import existing ones (same credentials work everywhere)
# =============================================================================

phase2_deploy_infrastructure() {
    log_phase "2" "DEPLOY INFRASTRUCTURE TO NEW REGION"

    cd "$TF_DIR"

    log_step "Planning infrastructure deployment..."
    log_info "Note: Global resources (service accounts, secrets) will be imported if they exist"

    # =============================================================================
    # Pre-import global resources that likely already exist
    # This prevents 409 errors during terraform apply (Issue #11 pattern)
    #
    # IMPORTANT: terraform import requires the same -var flags as terraform apply
    # to ensure state consistency with the planned configuration.
    # =============================================================================
    log_step "Pre-importing existing global resources (service accounts, secrets)..."

    # Common vars for all terraform commands
    # NOTE: keycloak_domain must use DR domain (e.g., auth-dr.tamshai.com) for recovery mode
    # because domain mappings are region-bound (auth.tamshai.com is bound to us-central1)
    local TF_VARS=(
        -var="region=$NEW_REGION"
        -var="zone=$NEW_ZONE"
        -var="env_id=$ENV_ID"
        -var="project_id=$PROJECT_ID"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=${KEYCLOAK_DR_DOMAIN}"
    )

    # Import service accounts if they exist
    # Service account names come from configuration variables
    declare -A sa_mapping=(
        ["keycloak"]="${SA_KEYCLOAK}:module.security.google_service_account.keycloak"
        ["mcp-gateway"]="${SA_MCP_GATEWAY}:module.security.google_service_account.mcp_gateway"
        ["mcp-servers"]="${SA_MCP_SERVERS}:module.security.google_service_account.mcp_servers"
        ["cicd"]="${SA_CICD}:module.security.google_service_account.cicd"
        ["provision"]="${SA_PROVISION}:module.security.google_service_account.provision_job"
    )

    for sa_key in "${!sa_mapping[@]}"; do
        local sa_entry="${sa_mapping[$sa_key]}"
        local sa_id="${sa_entry%%:*}"
        local tf_resource="${sa_entry#*:}"
        local sa_email="${sa_id}@${PROJECT_ID}.iam.gserviceaccount.com"

        # Check if SA exists in GCP but not in state
        if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
                log_info "  Importing existing service account: $sa_id"
                terraform import "${TF_VARS[@]}" "$tf_resource" \
                    "projects/${PROJECT_ID}/serviceAccounts/${sa_email}" 2>/dev/null || true
            fi
        fi
    done

    # Import secrets if they exist
    # Secret names come from configuration variables
    local secret_list=(
        "${SECRET_KEYCLOAK_ADMIN_PASSWORD}:module.security.google_secret_manager_secret.keycloak_admin_password"
        "${SECRET_KEYCLOAK_DB_PASSWORD}:module.security.google_secret_manager_secret.keycloak_db_password"
        "${SECRET_DB_PASSWORD}:module.security.google_secret_manager_secret.tamshai_db_password"
        "${SECRET_CLAUDE_API_KEY}:module.security.google_secret_manager_secret.anthropic_api_key"
        "${SECRET_MCP_GATEWAY_CLIENT}:module.security.google_secret_manager_secret.mcp_gateway_client_secret"
        "${SECRET_JWT}:module.security.google_secret_manager_secret.jwt_secret"
        "${SECRET_MCP_HR_CLIENT}:module.security.google_secret_manager_secret.mcp_hr_service_client_secret"
        "${SECRET_PROD_USER_PASSWORD}:module.security.google_secret_manager_secret.prod_user_password"
    )

    for secret_entry in "${secret_list[@]}"; do
        local secret_id="${secret_entry%%:*}"
        local tf_resource="${secret_entry#*:}"

        if gcloud secrets describe "$secret_id" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
                log_info "  Importing existing secret: $secret_id"
                terraform import "${TF_VARS[@]}" "$tf_resource" \
                    "projects/${PROJECT_ID}/secrets/${secret_id}" 2>/dev/null || true
            fi
        fi
    done

    # Import Artifact Registry if it exists (project-global)
    # CRITICAL: This import must succeed for staged deployment to work (Issue #102)
    log_step "Checking Artifact Registry..."
    local registry_imported=false
    if gcloud artifacts repositories describe tamshai --location="$NEW_REGION" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_info "  Artifact Registry exists in $NEW_REGION"
        if ! terraform state show 'module.cloudrun.google_artifact_registry_repository.tamshai' &>/dev/null 2>&1; then
            log_info "  Importing existing Artifact Registry: tamshai"
            if terraform import "${TF_VARS[@]}" 'module.cloudrun.google_artifact_registry_repository.tamshai' \
                "projects/${PROJECT_ID}/locations/${NEW_REGION}/repositories/tamshai"; then
                log_info "  Import successful"
                registry_imported=true
            else
                log_warn "  Import failed (may already be in state or conflict)"
            fi
        else
            log_info "  Artifact Registry already in state"
            registry_imported=true
        fi
    else
        log_info "  Artifact Registry does not exist in $NEW_REGION - will be created"
        registry_imported=true  # Will be created, not imported
    fi

    # =============================================================================
    # Pre-import storage buckets (they're SHARED, no suffix)
    # Storage buckets are global resources that should be reused between primary
    # and recovery deployments. We import them rather than recreate to avoid:
    # 1. Bucket name conflicts (global namespace)
    # 2. Data loss (backups bucket contains recovery data!)
    # 3. 63-char name limit issues with long suffixes
    # =============================================================================
    log_step "Pre-importing shared storage buckets..."

    # Logs bucket
    local logs_bucket="tamshai-prod-logs-${PROJECT_ID}"
    if gcloud storage buckets describe "gs://${logs_bucket}" &>/dev/null 2>&1; then
        if ! terraform state show 'module.storage.google_storage_bucket.logs' &>/dev/null 2>&1; then
            log_info "  Importing existing logs bucket: $logs_bucket"
            terraform import "${TF_VARS[@]}" 'module.storage.google_storage_bucket.logs' \
                "${PROJECT_ID}/${logs_bucket}" 2>/dev/null || true
        fi
    fi

    # Finance docs bucket
    local finance_bucket="tamshai-prod-finance-docs-${PROJECT_ID}"
    if gcloud storage buckets describe "gs://${finance_bucket}" &>/dev/null 2>&1; then
        if ! terraform state show 'module.storage.google_storage_bucket.finance_docs' &>/dev/null 2>&1; then
            log_info "  Importing existing finance docs bucket: $finance_bucket"
            terraform import "${TF_VARS[@]}" 'module.storage.google_storage_bucket.finance_docs' \
                "${PROJECT_ID}/${finance_bucket}" 2>/dev/null || true
        fi
    fi

    # Public docs bucket
    local public_bucket="tamshai-prod-public-docs-${PROJECT_ID}"
    if gcloud storage buckets describe "gs://${public_bucket}" &>/dev/null 2>&1; then
        if ! terraform state show 'module.storage.google_storage_bucket.public_docs' &>/dev/null 2>&1; then
            log_info "  Importing existing public docs bucket: $public_bucket"
            terraform import "${TF_VARS[@]}" 'module.storage.google_storage_bucket.public_docs' \
                "${PROJECT_ID}/${public_bucket}" 2>/dev/null || true
        fi
    fi

    # Static website bucket (domain-based)
    local static_bucket="prod.tamshai.com"
    if gcloud storage buckets describe "gs://${static_bucket}" &>/dev/null 2>&1; then
        if ! terraform state show 'module.storage.google_storage_bucket.static_website[0]' &>/dev/null 2>&1; then
            log_info "  Importing existing static website bucket: $static_bucket"
            terraform import "${TF_VARS[@]}" 'module.storage.google_storage_bucket.static_website[0]' \
                "${PROJECT_ID}/${static_bucket}" 2>/dev/null || true
        fi
    fi

    # Backups bucket (multi-regional, critical for DR!)
    local backups_bucket="tamshai-prod-backups-${PROJECT_ID}"
    if gcloud storage buckets describe "gs://${backups_bucket}" &>/dev/null 2>&1; then
        if ! terraform state show 'module.storage.google_storage_bucket.backups[0]' &>/dev/null 2>&1; then
            log_info "  Importing existing backups bucket: $backups_bucket"
            terraform import "${TF_VARS[@]}" 'module.storage.google_storage_bucket.backups[0]' \
                "${PROJECT_ID}/${backups_bucket}" 2>/dev/null || true
        fi
    fi

    log_success "Pre-import complete"

    # Refresh terraform state to ensure GCS backend is synced after all imports
    # This prevents state drift issues with -target flags (Issue #102)
    log_step "Refreshing terraform state to sync with GCS backend..."
    terraform refresh "${TF_VARS[@]}" -compact-warnings 2>/dev/null || {
        log_warn "Terraform refresh had warnings (may be OK)"
    }

    # Verify Artifact Registry is in state (critical for staged deployment)
    if [[ "$registry_imported" == "true" ]] || terraform state list 2>/dev/null | grep -q 'google_artifact_registry_repository.tamshai'; then
        log_info "  Artifact Registry confirmed in state"
    else
        log_warn "  Artifact Registry NOT in state - staged deployment may use full apply fallback"
    fi

    # =============================================================================
    # Verify MongoDB URI secret exists (shared function from lib/secrets.sh)
    # =============================================================================
    # Uses verify_mongodb_uri_secret() from lib/secrets.sh - same as phoenix-rebuild.sh
    # =============================================================================
    if ! verify_mongodb_uri_secret "$PROJECT_ID"; then
        exit 1
    fi

    # =============================================================================
    # Apply infrastructure using staged deployment (Issue #37 pattern)
    # =============================================================================
    # Problem: mcp-gateway fails startup probes if Keycloak SSL cert isn't ready.
    # Solution: Deploy in stages - Keycloak first, wait for SSL, then mcp-gateway.
    # =============================================================================
    log_step "Applying infrastructure using staged deployment (Issue #37 pattern)..."
    log_info "Cloud SQL instance creation typically takes 10-15 minutes"
    log_info "SSL certificate provisioning typically takes 10-15 minutes"

    # Common terraform variables for all stages
    local TF_COMMON_VARS=(
        -var="region=$NEW_REGION"
        -var="zone=$NEW_ZONE"
        -var="env_id=$ENV_ID"
        -var="project_id=$PROJECT_ID"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=${KEYCLOAK_DR_DOMAIN}"
    )

    # Use staged deployment from domain-mapping.sh library if available
    if type staged_terraform_deploy &>/dev/null; then
        log_info "Using staged_terraform_deploy from domain-mapping.sh library"
        staged_terraform_deploy "${KEYCLOAK_DR_DOMAIN}" "${KEYCLOAK_REALM}" "${TF_COMMON_VARS[@]}" || {
            log_error "Staged terraform deployment failed"
            exit 1
        }
    else
        # Fallback: Manual staged deployment
        log_warn "staged_terraform_deploy not available - using manual staging"

        # Stage 1: Deploy everything EXCEPT mcp-gateway
        log_step "Stage 1: Deploying infrastructure (except mcp-gateway)..."
        local stage1_targets=(
            "-target=module.networking"
            "-target=module.database"
            "-target=module.security"
            "-target=module.storage"
            "-target=module.cloudrun.google_artifact_registry_repository.tamshai"
            "-target=module.cloudrun.google_cloud_run_service.keycloak"
            "-target=module.cloudrun.google_cloud_run_service.mcp_suite"
            "-target=module.cloudrun.google_cloud_run_service.web_portal"
            "-target=module.cloudrun.google_cloud_run_domain_mapping.keycloak"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.keycloak_public"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.web_portal_public"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_suite_gateway_access"
            "-target=module.utility_vm"
        )

        terraform apply -auto-approve "${stage1_targets[@]}" "${TF_COMMON_VARS[@]}" || {
            log_error "Stage 1 terraform apply failed"
            exit 1
        }
        log_success "Stage 1 complete - Keycloak and MCP Suite deployed"

        # Stage 2: Wait for SSL certificate
        log_step "Stage 2: Waiting for SSL certificate on ${KEYCLOAK_DR_DOMAIN}..."
        log_info "SSL provisioning typically takes 10-15 minutes for new domain mappings"

        local ssl_timeout=900  # 15 minutes
        local ssl_elapsed=0
        local ssl_interval=30

        while [ $ssl_elapsed -lt $ssl_timeout ]; do
            if curl -sf "https://${KEYCLOAK_DR_DOMAIN}/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then
                log_success "SSL certificate deployed for ${KEYCLOAK_DR_DOMAIN}"
                break
            fi
            log_info "  Waiting for SSL... ($((ssl_elapsed / 60))m elapsed)"
            sleep $ssl_interval
            ssl_elapsed=$((ssl_elapsed + ssl_interval))
        done

        if [ $ssl_elapsed -ge $ssl_timeout ]; then
            log_warn "SSL certificate not ready after 15 minutes"
            log_warn "mcp-gateway deployment may fail - consider retrying later"
        fi

        # Stage 3: Deploy mcp-gateway
        log_step "Stage 3: Deploying mcp-gateway..."
        local stage2_targets=(
            "-target=module.cloudrun.google_cloud_run_service.mcp_gateway"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_gateway_public"
        )

        terraform apply -auto-approve "${stage2_targets[@]}" "${TF_COMMON_VARS[@]}" || {
            log_error "Stage 3 terraform apply failed (mcp-gateway)"
            log_error "This usually means Keycloak SSL isn't ready yet"
            log_error "Wait a few minutes and run: terraform apply ${stage2_targets[*]}"
            exit 1
        }
    fi

    # =============================================================================
    # Add MongoDB URI IAM binding (shared function from lib/secrets.sh, Gap #32)
    # =============================================================================
    # Uses ensure_mongodb_uri_iam_binding() from lib/secrets.sh - same as phoenix-rebuild.sh
    # This provides a fallback/safety net in case terraform state gets out of sync.
    # =============================================================================
    ensure_mongodb_uri_iam_binding "$PROJECT_ID" || true

    log_success "Infrastructure deployed to $NEW_REGION"
}

# =============================================================================
# PHASE 3: REGENERATE SERVICE ACCOUNT KEY
# =============================================================================

phase3_regenerate_key() {
    log_phase "3" "REGENERATE SERVICE ACCOUNT KEY"

    local sa_email="${SA_CICD}@${PROJECT_ID}.iam.gserviceaccount.com"
    local key_file="/tmp/recovery-key-$$.json"

    log_step "Creating new CICD service account key for ${SA_CICD}..."
    gcloud iam service-accounts keys create "$key_file" \
        --iam-account="$sa_email"

    log_step "Updating GitHub secret GCP_SA_KEY_PROD..."
    gh secret set GCP_SA_KEY_PROD < "$key_file"

    # Secure cleanup
    rm -f "$key_file"

    log_success "Service account key regenerated and synced to GitHub"
}

# =============================================================================
# PHASE 4: DEPLOY CLOUD RUN SERVICES
# =============================================================================

phase4_deploy_services() {
    log_phase "4" "DEPLOY CLOUD RUN SERVICES"

    log_step "Triggering deploy-to-gcp.yml workflow..."
    gh workflow run deploy-to-gcp.yml \
        -f service=all \
        -f region="$NEW_REGION"

    log_info "Waiting for workflow to start..."
    sleep 10

    # Get the run ID
    local run_id
    run_id=$(gh run list --workflow=deploy-to-gcp.yml --limit=1 --json databaseId --jq '.[0].databaseId')

    log_step "Monitoring deployment (Run ID: $run_id)..."
    gh run watch "$run_id"

    # Check result
    local conclusion
    conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')

    if [ "$conclusion" != "success" ]; then
        log_error "Deployment workflow failed with conclusion: $conclusion"
        exit 1
    fi

    log_success "Cloud Run services deployed successfully"
}

# =============================================================================
# PHASE 5: CONFIGURE TEST USER
# =============================================================================

phase5_configure_test_user() {
    log_phase "5" "CONFIGURE TEST USER"

    log_step "Configuring TOTP for test-user.journey..."

    # Get Keycloak admin password from Secret Manager
    export KEYCLOAK_ADMIN_PASSWORD
    KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
        --secret="${SECRET_KEYCLOAK_ADMIN_PASSWORD}" 2>/dev/null || echo "")

    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        log_warn "Could not retrieve Keycloak admin password - skipping TOTP configuration"
        log_info "Run manually: ./keycloak/scripts/set-user-totp.sh prod test-user.journey"
        return 0
    fi

    export AUTO_CONFIRM=true
    "$PROJECT_ROOT/keycloak/scripts/set-user-totp.sh" prod test-user.journey || {
        log_warn "TOTP configuration failed - may need manual setup"
    }

    log_success "Test user configured"
}

# =============================================================================
# PHASE 6: VERIFY DEPLOYMENT
# =============================================================================

phase6_verify() {
    log_phase "6" "VERIFY DEPLOYMENT"

    cd "$TF_DIR"

    # Get outputs
    local gateway_url keycloak_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "")

    log_step "Verifying Keycloak health..."
    if curl -sf "${keycloak_url}/auth/health/ready" &>/dev/null; then
        log_success "Keycloak is healthy"
    else
        log_warn "Keycloak health check failed - may still be starting"
    fi

    log_step "Verifying MCP Gateway health..."
    if curl -sf "${gateway_url}/health" &>/dev/null; then
        log_success "MCP Gateway is healthy"
    else
        log_warn "MCP Gateway health check failed - may still be starting"
    fi

    # Run E2E tests if available
    log_step "Running E2E verification tests..."
    cd "$PROJECT_ROOT/tests/e2e"

    if [ -f "package.json" ]; then
        # Load test credentials
        eval "$("$PROJECT_ROOT/scripts/secrets/read-github-secrets.sh" --e2e --env 2>/dev/null)" || true

        npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1 || {
            log_warn "E2E tests failed - manual verification required"
        }
    else
        log_info "E2E tests not available - skipping"
    fi

    log_success "Verification complete"
}

# =============================================================================
# PHASE 7: DNS CONFIGURATION GUIDANCE
# =============================================================================

phase7_dns_guidance() {
    log_phase "7" "DNS CONFIGURATION"

    cd "$TF_DIR"

    local gateway_url keycloak_url portal_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "")
    portal_url=$(terraform output -raw web_portal_url 2>/dev/null || echo "")

    # Extract hostnames without https://
    local gateway_host="${gateway_url#https://}"
    local keycloak_host="${keycloak_url#https://}"
    local portal_host="${portal_url#https://}"

    log_step "New service URLs for DNS configuration:"
    log_info "MCP Gateway: $gateway_host"
    log_info "Keycloak: $keycloak_host"
    log_info "Web Portal: $portal_host"

    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                       MANUAL DNS UPDATES REQUIRED                            ║${NC}"
    echo -e "${YELLOW}╠══════════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}║  1. API Domain (Cloudflare):                                                 ║${NC}"
    echo -e "${YELLOW}║     api.tamshai.com CNAME → ${gateway_host}${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}║  2. Keycloak Domain:                                                         ║${NC}"
    echo -e "${YELLOW}║     ⚠️  auth.tamshai.com CANNOT be remapped during regional outage!          ║${NC}"
    echo -e "${YELLOW}║     The domain mapping is bound to the dead region.                          ║${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}║     Options:                                                                 ║${NC}"
    echo -e "${YELLOW}║     a) Use pre-configured ${KEYCLOAK_DR_DOMAIN} (recommended)               ║${NC}"
    echo -e "${YELLOW}║     b) Use raw Cloud Run URL: ${keycloak_host}${NC}"
    echo -e "${YELLOW}║     c) Wait for primary region recovery                                      ║${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}║  3. Web Portal (if domain-mapped):                                           ║${NC}"
    echo -e "${YELLOW}║     Update CNAME or rebuild with new Keycloak URL:                           ║${NC}"
    echo -e "${YELLOW}║     VITE_KEYCLOAK_URL=https://${KEYCLOAK_DR_DOMAIN}/auth                    ║${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check if Cloudflare API token is available
    if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
        log_step "Cloudflare credentials detected - attempting automatic DNS update for api.tamshai.com..."

        # Get current record ID
        local record_id
        record_id=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=api.tamshai.com&type=CNAME" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" | jq -r '.result[0].id // empty')

        if [ -n "$record_id" ]; then
            local update_result
            update_result=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
                -H "Authorization: Bearer ${CF_API_TOKEN}" \
                -H "Content-Type: application/json" \
                --data "{
                    \"type\": \"CNAME\",
                    \"name\": \"api\",
                    \"content\": \"${gateway_host}\",
                    \"proxied\": true
                }")

            if echo "$update_result" | jq -e '.success' &>/dev/null; then
                log_success "api.tamshai.com DNS updated automatically!"
            else
                log_warn "DNS update failed: $(echo "$update_result" | jq -r '.errors[0].message // "Unknown error"')"
                log_info "Please update DNS manually in Cloudflare dashboard"
            fi
        else
            log_warn "Could not find api.tamshai.com record in Cloudflare"
            log_info "Please update DNS manually in Cloudflare dashboard"
        fi
    else
        log_info "Set CF_API_TOKEN and CF_ZONE_ID for automatic DNS updates"
    fi

    log_success "DNS guidance complete"
}

# =============================================================================
# SUMMARY
# =============================================================================

show_summary() {
    cd "$TF_DIR"

    local gateway_url keycloak_url portal_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "N/A")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "N/A")
    portal_url=$(terraform output -raw web_portal_url 2>/dev/null || echo "N/A")

    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                 REGIONAL EVACUATION COMPLETE                      ${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Region:            ${CYAN}$NEW_REGION${NC}"
    echo -e "  Environment ID:    ${CYAN}$ENV_ID${NC}"
    echo -e "  State Prefix:      ${CYAN}gcp/recovery/$ENV_ID${NC}"
    echo ""
    echo -e "  ${BLUE}Service URLs:${NC}"
    echo -e "    MCP Gateway:     $gateway_url"
    echo -e "    Keycloak:        $keycloak_url"
    echo -e "    Web Portal:      $portal_url"
    echo ""
    echo -e "${YELLOW}NEXT STEPS:${NC}"
    echo -e "  1. Update DNS records if not using global load balancer"
    echo -e "  2. Verify E2E tests pass: cd tests/e2e && npm run test:login:prod"
    echo -e "  3. Notify stakeholders of new service URLs"
    echo -e "  4. Once primary region recovers, clean up orphaned resources"
    echo ""
    echo -e "${YELLOW}TO RESTORE DATA FROM BACKUP:${NC}"
    echo -e "  ./scripts/db/restore-from-gcs.sh --bucket=$BACKUP_BUCKET"
    echo ""
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}              REGIONAL EVACUATION - DISASTER RECOVERY               ${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}WARNING: This script is for use when the primary region is UNAVAILABLE.${NC}"
    echo -e "${YELLOW}For normal rebuilds, use: ./scripts/gcp/phoenix-rebuild.sh${NC}"
    echo ""

    local start_time
    start_time=$(date +%s)

    preflight_checks
    confirm_evacuation
    run_cleanup_leftover_resources

    phase1_init_state
    phase1_5_replicate_images
    phase2_deploy_infrastructure
    phase3_regenerate_key
    phase4_deploy_services
    phase5_configure_test_user
    phase6_verify
    phase7_dns_guidance

    local end_time duration_min
    end_time=$(date +%s)
    duration_min=$(( (end_time - start_time) / 60 ))

    show_summary

    log_success "Regional evacuation completed in ${duration_min} minutes"
}

# Run main
main "$@"
