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
#   --region=REGION     Target region (default: us-west1)
#   --zone=ZONE         Target zone (default: REGION-b)
#   --env-id=ID         Environment ID (default: recovery-YYYYMMDD-HHMM)
#   -h, --help          Show this help message
#
# Examples:
#   ./evacuate-region.sh                                    # us-west1, auto-generated ID
#   ./evacuate-region.sh us-west1 us-west1-b recovery-01    # Specific region and ID
#   ./evacuate-region.sh us-east1 us-east1-b                # East coast, auto-generated ID
#   ./evacuate-region.sh --yes us-west1 us-west1-b test-01  # Skip confirmation
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
if [ -f "$SCRIPT_DIR/lib/health-checks.sh" ]; then
    source "$SCRIPT_DIR/lib/health-checks.sh" 2>/dev/null || true
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

# Defaults
NEW_REGION="us-west1"
NEW_ZONE=""
ENV_ID=""
AUTO_YES=false  # Skip interactive confirmations

# Parse arguments (supports both positional and flags)
POSITIONAL_ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) AUTO_YES=true; shift ;;
        --region=*) NEW_REGION="${1#*=}"; shift ;;
        --zone=*) NEW_ZONE="${1#*=}"; shift ;;
        --env-id=*) ENV_ID="${1#*=}"; shift ;;
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

# Set defaults based on region
NEW_ZONE="${NEW_ZONE:-${NEW_REGION}-b}"
ENV_ID="${ENV_ID:-recovery-$(date +%Y%m%d-%H%M)}"

# GCP Configuration
PROJECT_ID="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"
STATE_BUCKET="tamshai-terraform-state-prod"
BACKUP_BUCKET="tamshai-backups-us"  # Multi-regional backup bucket

# Terraform directory
TF_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"

# Colors
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

    # Validate target zone exists
    log_step "Validating target zone: $NEW_ZONE..."
    if ! gcloud compute zones describe "$NEW_ZONE" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Invalid GCP zone: $NEW_ZONE"
        ((errors++))
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
    echo -e "  Target Region:     ${CYAN}$NEW_REGION${NC}"
    echo -e "  Target Zone:       ${CYAN}$NEW_ZONE${NC}"
    echo -e "  Environment ID:    ${CYAN}$ENV_ID${NC}"
    echo -e "  State Prefix:      ${CYAN}gcp/recovery/$ENV_ID${NC}"
    echo -e "  Project:           ${CYAN}$PROJECT_ID${NC}"
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
# Similar to phoenix-rebuild.sh pre-destroy cleanup, this phase removes any
# leftover GCP resources from previous failed evacuation attempts.
#
# This is necessary because:
# 1. Terraform may have created some resources before failing
# 2. The fresh state file doesn't know about these orphaned resources
# 3. Re-running terraform apply will fail with "already exists" errors
# =============================================================================

cleanup_leftover_resources() {
    log_phase "0.5" "PRE-CLEANUP: REMOVE LEFTOVER RESOURCES"

    local name_suffix="-${ENV_ID}"
    local vpc_name="tamshai-prod${name_suffix}-vpc"

    log_step "Checking for leftover resources from previous attempts..."
    log_info "Looking for resources with suffix: $name_suffix"

    # Check if VPC exists (primary indicator of leftover resources)
    if gcloud compute networks describe "$vpc_name" --project="$PROJECT_ID" &>/dev/null; then
        log_warn "Found leftover VPC: $vpc_name"
        log_info "Cleaning up leftover resources from failed evacuation attempt..."

        # Step 1: Delete Cloud Run services (release DB connections)
        log_step "Deleting leftover Cloud Run services..."
        local services=("keycloak" "mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "web-portal")
        for svc in "${services[@]}"; do
            if gcloud run services describe "$svc" --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
                log_info "  Deleting $svc..."
                gcloud run services delete "$svc" --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
            fi
        done

        # Step 2: Delete VPC Access Connector (takes 2-3 minutes)
        # IMPORTANT: Connector MUST be deleted BEFORE subnet deletion (connector uses subnet IPs)
        # The connector name uses MD5 hash for long env_ids: tamshai-<8-char-hash>
        log_step "Deleting leftover VPC connectors..."

        # Find ALL connectors that might be associated with this VPC
        # (not just the expected names - there may be orphaned connectors)
        local all_connectors
        all_connectors=$(gcloud compute networks vpc-access connectors list \
            --region="${NEW_REGION}" \
            --project="$PROJECT_ID" \
            --format="value(name)" 2>/dev/null | grep -E "^tamshai" || true)

        for connector in $all_connectors; do
            # Check if this connector is in our VPC
            local connector_network
            connector_network=$(gcloud compute networks vpc-access connectors describe "$connector" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" \
                --format="value(network)" 2>/dev/null || echo "")

            # Extract network name from full path (projects/xxx/global/networks/vpc-name)
            connector_network="${connector_network##*/}"

            if [ "$connector_network" = "$vpc_name" ]; then
                log_info "  Found VPC connector '$connector' in VPC '$vpc_name' - deleting..."
                gcloud compute networks vpc-access connectors delete "$connector" \
                    --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true

                # Wait for deletion (async operation takes 2-3 minutes)
                local wait_count=0
                local max_wait=20  # 20 * 15s = 5 minutes max
                while gcloud compute networks vpc-access connectors describe "$connector" \
                    --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; do
                    wait_count=$((wait_count + 1))
                    if [ $wait_count -ge $max_wait ]; then
                        log_error "VPC connector '$connector' deletion timeout after 5 minutes"
                        log_error "Cannot delete subnet while connector exists - aborting"
                        exit 1
                    fi
                    log_info "    Waiting for VPC connector deletion (takes 2-3 minutes)... [$wait_count/$max_wait]"
                    sleep 15
                done
                log_success "  VPC connector '$connector' deleted"
            fi
        done

        # Also check for expected connector names that might not be in the list output
        local connector_name
        connector_name="tamshai-$(echo -n "$name_suffix" | md5sum | cut -c1-8)"
        if gcloud compute networks vpc-access connectors describe "$connector_name" \
            --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Found additional VPC connector: $connector_name..."
            gcloud compute networks vpc-access connectors delete "$connector_name" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true

            local wait_count=0
            local max_wait=20
            while gcloud compute networks vpc-access connectors describe "$connector_name" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; do
                wait_count=$((wait_count + 1))
                if [ $wait_count -ge $max_wait ]; then
                    log_error "VPC connector deletion timeout - aborting"
                    exit 1
                fi
                log_info "    Waiting for VPC connector deletion... [$wait_count/$max_wait]"
                sleep 15
            done
        fi

        # Step 3: Delete Cloud SQL instance (if exists)
        # Note: Terraform naming is "tamshai-${env}-postgres${suffix}" not "tamshai-${env}${suffix}-postgres"
        log_step "Deleting leftover Cloud SQL instances..."
        local sql_instance="tamshai-prod-postgres${name_suffix}"
        if gcloud sql instances describe "$sql_instance" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Disabling deletion protection..."
            gcloud sql instances patch "$sql_instance" --project="$PROJECT_ID" \
                --no-deletion-protection --quiet 2>/dev/null || true
            log_info "  Deleting Cloud SQL: $sql_instance..."
            gcloud sql instances delete "$sql_instance" --project="$PROJECT_ID" --quiet 2>/dev/null || true

            # Wait for Cloud SQL deletion
            local sql_wait=0
            local sql_max_wait=18  # 18 * 10s = 3 minutes max
            while gcloud sql instances describe "$sql_instance" --project="$PROJECT_ID" &>/dev/null 2>&1; do
                sql_wait=$((sql_wait + 1))
                if [ $sql_wait -ge $sql_max_wait ]; then
                    log_warn "Cloud SQL deletion timeout - continuing anyway"
                    break
                fi
                log_info "    Waiting for Cloud SQL deletion... [$sql_wait/$sql_max_wait]"
                sleep 10
            done
        fi

        # Step 4: Delete VPC peering connection (must be done before private IP deletion)
        # Following phoenix-rebuild.sh Issue #14 pattern:
        #   - Service networking peerings are always named "servicenetworking-googleapis-com"
        #   - Use compute API (gcloud compute networks peerings delete) for immediate deletion
        #   - Service networking API can fail with timing issues even after Cloud SQL is deleted
        log_step "Deleting leftover VPC peering..."

        # Check if peering exists (service networking peerings always have this name)
        local peering_name="servicenetworking-googleapis-com"
        if gcloud compute networks peerings list \
            --network="$vpc_name" \
            --project="$PROJECT_ID" \
            --format="value(name)" 2>/dev/null | grep -q "$peering_name"; then

            log_info "  Found VPC peering: $peering_name"

            # Use compute API directly (phoenix-rebuild.sh proven pattern)
            log_info "  Deleting via compute networks peerings API..."
            if gcloud compute networks peerings delete "$peering_name" \
                --network="$vpc_name" \
                --project="$PROJECT_ID" \
                --quiet 2>/dev/null; then
                log_success "  VPC peering deleted successfully via compute API"
            else
                log_warn "  Compute API returned error - checking if peering still exists..."
                # Verify deletion
                if ! gcloud compute networks peerings list \
                    --network="$vpc_name" \
                    --project="$PROJECT_ID" \
                    --format="value(name)" 2>/dev/null | grep -q "$peering_name"; then
                    log_success "  VPC peering confirmed deleted"
                else
                    # Peering still exists - wait and retry (GCP backend timing)
                    log_info "  Waiting for GCP backend to complete peering deletion..."
                    local wait_count=0
                    local max_wait=12  # 12 * 10s = 2 minutes max
                    while gcloud compute networks peerings list --network="$vpc_name" \
                        --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | grep -q "$peering_name"; do
                        wait_count=$((wait_count + 1))
                        if [ $wait_count -ge $max_wait ]; then
                            log_error "VPC peering deletion failed after $max_wait attempts"
                            log_error "Manual cleanup may be required"
                            exit 1
                        fi
                        log_info "    Waiting for peering deletion... [$wait_count/$max_wait]"
                        # Retry deletion on each loop
                        gcloud compute networks peerings delete "$peering_name" \
                            --network="$vpc_name" --project="$PROJECT_ID" --quiet 2>/dev/null || true
                        sleep 10
                    done
                    log_success "  VPC peering deleted successfully"
                fi
            fi
        else
            log_info "  No VPC peering found"
        fi

        # Step 5: Delete private IP addresses
        # Note: Terraform naming is "tamshai-${env}-private-ip${suffix}" not "tamshai-${env}${suffix}-private-ip"
        log_step "Deleting leftover private IP addresses..."
        local private_ip_name="tamshai-prod-private-ip${name_suffix}"
        if gcloud compute addresses describe "$private_ip_name" --global --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting: $private_ip_name..."
            gcloud compute addresses delete "$private_ip_name" --global --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi

        # Step 6: Delete Cloud NAT
        log_step "Deleting leftover Cloud NAT..."
        local nat_name="tamshai-prod${name_suffix}-nat"
        local router_name="tamshai-prod${name_suffix}-router"
        if gcloud compute routers nats describe "$nat_name" --router="$router_name" \
            --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting NAT: $nat_name..."
            gcloud compute routers nats delete "$nat_name" --router="$router_name" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi

        # Step 7: Delete Cloud Router
        log_step "Deleting leftover Cloud Router..."
        if gcloud compute routers describe "$router_name" \
            --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting router: $router_name..."
            gcloud compute routers delete "$router_name" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi

        # Step 8: Delete firewall rules
        log_step "Deleting leftover firewall rules..."
        local firewall_rules
        firewall_rules=$(gcloud compute firewall-rules list \
            --filter="network:$vpc_name" \
            --format="value(name)" \
            --project="$PROJECT_ID" 2>/dev/null)

        for rule in $firewall_rules; do
            log_info "  Deleting firewall rule: $rule..."
            gcloud compute firewall-rules delete "$rule" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        done

        # Step 8.5: Delete GCE instances using the target subnet
        # NOTE: The compute module does NOT support name_suffix, so GCE instances
        # are named 'tamshai-prod-keycloak' and 'tamshai-prod-mcp-gateway' regardless
        # of the evacuation suffix. We must delete any instances using the target subnet.
        log_step "Deleting GCE instances using target VPC subnet..."
        local subnet_name="tamshai-prod${name_suffix}-subnet"

        # List all instances in all zones for this region that use the target subnet
        local instances_in_subnet
        instances_in_subnet=$(gcloud compute instances list \
            --filter="networkInterfaces.subnetwork:${subnet_name}" \
            --format="csv[no-heading](name,zone)" \
            --project="$PROJECT_ID" 2>/dev/null || true)

        if [ -n "$instances_in_subnet" ]; then
            log_info "  Found GCE instances using subnet $subnet_name:"

            # Use process substitution to avoid subshell variable scoping issues
            while IFS=',' read -r instance_name instance_zone; do
                # Extract zone name from full path if needed (format: projects/xxx/zones/zzz)
                instance_zone="${instance_zone##*/}"
                log_info "    - $instance_name (zone: $instance_zone)"
            done <<< "$instances_in_subnet"

            # Delete each instance
            while IFS=',' read -r instance_name instance_zone; do
                instance_zone="${instance_zone##*/}"

                if [ -n "$instance_name" ] && [ -n "$instance_zone" ]; then
                    log_info "  Deleting instance: $instance_name in zone $instance_zone..."
                    if gcloud compute instances delete "$instance_name" \
                        --zone="$instance_zone" \
                        --project="$PROJECT_ID" \
                        --quiet 2>/dev/null; then
                        log_success "    Instance $instance_name deleted"
                    else
                        log_warn "    Failed to delete $instance_name (may already be deleted)"
                    fi
                fi
            done <<< "$instances_in_subnet"

            # Wait for instance deletions to complete (GCE instance deletion is async)
            log_info "  Waiting for GCE instance deletions to complete..."
            local wait_count=0
            local max_wait=12  # 12 * 10s = 2 minutes max
            while true; do
                local remaining
                remaining=$(gcloud compute instances list \
                    --filter="networkInterfaces.subnetwork:${subnet_name}" \
                    --format="value(name)" \
                    --project="$PROJECT_ID" 2>/dev/null || true)

                if [ -z "$remaining" ]; then
                    log_success "  All GCE instances in target subnet deleted"
                    break
                fi

                wait_count=$((wait_count + 1))
                if [ $wait_count -ge $max_wait ]; then
                    log_warn "  Timeout waiting for instance deletion. Remaining: $remaining"
                    break
                fi
                log_info "    Waiting for instances to terminate... [$wait_count/$max_wait]"
                sleep 10
            done
        else
            log_info "  No GCE instances found using subnet $subnet_name"
        fi

        # Step 9: Delete subnets
        log_step "Deleting leftover subnets..."
        # Note: subnet_name already defined in Step 8.5
        if gcloud compute networks subnets describe "$subnet_name" \
            --region="${NEW_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting subnet: $subnet_name..."
            gcloud compute networks subnets delete "$subnet_name" \
                --region="${NEW_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi

        # Step 10: Delete routes (can block VPC deletion)
        log_step "Deleting leftover routes..."
        local routes
        routes=$(gcloud compute routes list \
            --filter="network:$vpc_name" \
            --format="value(name)" \
            --project="$PROJECT_ID" 2>/dev/null | grep -v "^default-" || true)

        for route in $routes; do
            log_info "  Deleting route: $route..."
            gcloud compute routes delete "$route" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        done

        # Step 11: Delete VPC network (last - everything else must be deleted first)
        # Following phoenix-rebuild.sh patterns for robust deletion
        log_step "Deleting leftover VPC network..."

        local vpc_wait=0
        local vpc_max_wait=12  # 12 * 10s = 2 minutes max for VPC deletion
        local vpc_exists=true

        while [ "$vpc_exists" = "true" ]; do
            # Robust check: look for the VPC by name in the list output
            # This is more reliable than describe which can fail for various reasons
            local vpc_check
            vpc_check=$(gcloud compute networks list \
                --filter="name=$vpc_name" \
                --format="value(name)" \
                --project="$PROJECT_ID" 2>/dev/null || echo "ERROR")

            if [ "$vpc_check" = "ERROR" ]; then
                log_warn "  GCP API error checking VPC - retrying..."
                sleep 5
                continue
            fi

            if [ -z "$vpc_check" ]; then
                # VPC does not exist
                vpc_exists=false
                log_success "  VPC $vpc_name confirmed deleted"
                break
            fi

            # VPC still exists - try to delete
            vpc_wait=$((vpc_wait + 1))
            if [ $vpc_wait -ge $vpc_max_wait ]; then
                log_error "VPC $vpc_name could not be deleted after $vpc_max_wait attempts"
                log_error ""
                log_error "Remaining dependencies blocking VPC deletion:"
                echo ""
                log_info "Subnets:"
                gcloud compute networks subnets list --filter="network:$vpc_name" --project="$PROJECT_ID" 2>/dev/null || echo "  (none or error)"
                log_info "Firewall rules:"
                gcloud compute firewall-rules list --filter="network:$vpc_name" --project="$PROJECT_ID" 2>/dev/null || echo "  (none or error)"
                log_info "Routes (non-default):"
                gcloud compute routes list --filter="network:$vpc_name" --project="$PROJECT_ID" 2>/dev/null | grep -v "^default-" || echo "  (none or error)"
                log_info "VPC Access Connectors:"
                gcloud compute networks vpc-access connectors list --region="$NEW_REGION" --project="$PROJECT_ID" 2>/dev/null || echo "  (none or error)"
                log_info "VPC Peerings:"
                gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT_ID" 2>/dev/null || echo "  (none or error)"
                echo ""
                log_error "Cannot proceed with evacuation while leftover VPC exists"
                log_error "Manual cleanup required, then re-run this script"
                exit 1
            fi

            log_info "  Attempting to delete VPC (attempt $vpc_wait/$vpc_max_wait)..."

            # Before trying VPC deletion, force-delete any remaining dependencies
            # These may have been created by other GCP services (auto-firewall rules, etc.)

            # Force delete remaining firewall rules
            local remaining_fw
            remaining_fw=$(gcloud compute firewall-rules list \
                --filter="network:$vpc_name" \
                --format="value(name)" \
                --project="$PROJECT_ID" 2>/dev/null || true)
            for fw in $remaining_fw; do
                log_info "    Force-deleting firewall rule: $fw"
                gcloud compute firewall-rules delete "$fw" --project="$PROJECT_ID" --quiet 2>/dev/null || true
            done

            # Force delete remaining routes (except default)
            local remaining_routes
            remaining_routes=$(gcloud compute routes list \
                --filter="network:$vpc_name" \
                --format="value(name)" \
                --project="$PROJECT_ID" 2>/dev/null | grep -v "^default-" || true)
            for route in $remaining_routes; do
                log_info "    Force-deleting route: $route"
                gcloud compute routes delete "$route" --project="$PROJECT_ID" --quiet 2>/dev/null || true
            done

            # Force delete remaining subnets
            local remaining_subnets
            remaining_subnets=$(gcloud compute networks subnets list \
                --filter="network:$vpc_name" \
                --format="value(name,region)" \
                --project="$PROJECT_ID" 2>/dev/null || true)
            while IFS=$'\t' read -r subnet_name subnet_region; do
                if [ -n "$subnet_name" ]; then
                    log_info "    Force-deleting subnet: $subnet_name in $subnet_region"
                    gcloud compute networks subnets delete "$subnet_name" \
                        --region="${subnet_region##*/}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
                fi
            done <<< "$remaining_subnets"

            # Now try to delete VPC
            gcloud compute networks delete "$vpc_name" --project="$PROJECT_ID" --quiet 2>/dev/null || {
                log_info "    VPC deletion pending - waiting for dependencies to clear..."
            }

            sleep 10
        done
        log_success "Leftover resources cleaned up"
    else
        log_info "No leftover VPC found - environment is clean"
    fi

    # Also clean up any stale terraform state locks
    log_step "Checking for stale terraform state locks..."
    local lock_file="gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/default.tflock"
    if gcloud storage cat "$lock_file" &>/dev/null 2>&1; then
        log_warn "Found stale lock file - removing..."
        gcloud storage rm "$lock_file" 2>/dev/null || true
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
                    # Phoenix Gap #56: Must specify --dockerfile for non-standard Dockerfile name
                    log_info "    Building keycloak (Dockerfile.cloudbuild)..."
                    if gcloud builds submit "${PROJECT_ROOT}/keycloak" \
                        --tag="$target_image" \
                        --dockerfile=Dockerfile.cloudbuild \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt keycloak successfully"
                        copy_success=true
                    fi
                    ;;
                web-portal)
                    # Web portal needs repo root context with Dockerfile.prod
                    # Phoenix Gap #55: Must build from repo root, use -f for Dockerfile path
                    log_info "    Building web-portal (Dockerfile.prod from repo root)..."
                    if gcloud builds submit "${PROJECT_ROOT}" \
                        --tag="$target_image" \
                        --dockerfile=clients/web/Dockerfile.prod \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt web-portal successfully"
                        copy_success=true
                    fi
                    ;;
                mcp-gateway|mcp-hr|mcp-finance|mcp-sales|mcp-support)
                    # Standard MCP services
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
                    # Provision job is in keycloak directory
                    log_info "    Building provision-job..."
                    if gcloud builds submit "${PROJECT_ROOT}/keycloak" \
                        --tag="$target_image" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet 2>&1; then
                        log_success "    Rebuilt provision-job successfully"
                        copy_success=true
                    fi
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
    local TF_VARS=(
        -var="region=$NEW_REGION"
        -var="zone=$NEW_ZONE"
        -var="env_id=$ENV_ID"
        -var="project_id=$PROJECT_ID"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
    )

    # Import service accounts if they exist
    local sa_list=("keycloak" "mcp-gateway" "mcp-servers" "cicd" "provision")
    for sa_name in "${sa_list[@]}"; do
        local sa_id="tamshai-prod-${sa_name}"
        local sa_email="${sa_id}@${PROJECT_ID}.iam.gserviceaccount.com"

        # Check if SA exists in GCP but not in state
        if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            local tf_resource
            case $sa_name in
                "keycloak") tf_resource="module.security.google_service_account.keycloak" ;;
                "mcp-gateway") tf_resource="module.security.google_service_account.mcp_gateway" ;;
                "mcp-servers") tf_resource="module.security.google_service_account.mcp_servers" ;;
                "cicd") tf_resource="module.security.google_service_account.cicd" ;;
                "provision") tf_resource="module.security.google_service_account.provision_job" ;;
            esac

            if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
                log_info "  Importing existing service account: $sa_id"
                terraform import "${TF_VARS[@]}" "$tf_resource" \
                    "projects/${PROJECT_ID}/serviceAccounts/${sa_email}" 2>/dev/null || true
            fi
        fi
    done

    # Import secrets if they exist
    local secret_list=(
        "tamshai-prod-keycloak-admin-password:module.security.google_secret_manager_secret.keycloak_admin_password"
        "tamshai-prod-keycloak-db-password:module.security.google_secret_manager_secret.keycloak_db_password"
        "tamshai-prod-db-password:module.security.google_secret_manager_secret.tamshai_db_password"
        "tamshai-prod-anthropic-api-key:module.security.google_secret_manager_secret.anthropic_api_key"
        "tamshai-prod-mcp-gateway-client-secret:module.security.google_secret_manager_secret.mcp_gateway_client_secret"
        "tamshai-prod-jwt-secret:module.security.google_secret_manager_secret.jwt_secret"
        "mcp-hr-service-client-secret:module.security.google_secret_manager_secret.mcp_hr_service_client_secret"
        "prod-user-password:module.security.google_secret_manager_secret.prod_user_password"
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
    log_step "Checking Artifact Registry..."
    if gcloud artifacts repositories describe tamshai --location="$NEW_REGION" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        if ! terraform state show 'module.cloudrun.google_artifact_registry_repository.tamshai' &>/dev/null 2>&1; then
            log_info "  Importing existing Artifact Registry: tamshai"
            terraform import "${TF_VARS[@]}" 'module.cloudrun.google_artifact_registry_repository.tamshai' \
                "projects/${PROJECT_ID}/locations/${NEW_REGION}/repositories/tamshai" 2>/dev/null || true
        fi
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

    # =============================================================================
    # Apply infrastructure
    # =============================================================================
    log_step "Applying infrastructure (this may take 15-20 minutes)..."
    log_info "Cloud SQL instance creation typically takes 10-15 minutes"

    local apply_output
    local apply_exit_code=0

    apply_output=$(terraform apply -auto-approve \
        -var="region=$NEW_REGION" \
        -var="zone=$NEW_ZONE" \
        -var="env_id=$ENV_ID" \
        -var="project_id=$PROJECT_ID" \
        -var="recovery_mode=true" \
        -var="phoenix_mode=true" 2>&1) || apply_exit_code=$?

    if [ $apply_exit_code -ne 0 ]; then
        # Check if this is a 409 "already exists" error (Issue #11 pattern)
        if echo "$apply_output" | grep -q "Error 409.*already exists"; then
            log_warn "Detected 409 conflict - some resources exist but weren't in state"
            log_info "Attempting auto-recovery by importing and retrying..."

            # Import any resources mentioned in the error
            if echo "$apply_output" | grep -q "Service account.*already exists"; then
                log_info "  Re-importing service accounts..."
                for sa_name in keycloak mcp-gateway mcp-servers cicd provision; do
                    local sa_id="tamshai-prod-${sa_name}"
                    local sa_email="${sa_id}@${PROJECT_ID}.iam.gserviceaccount.com"
                    local tf_resource
                    case $sa_name in
                        "keycloak") tf_resource="module.security.google_service_account.keycloak" ;;
                        "mcp-gateway") tf_resource="module.security.google_service_account.mcp_gateway" ;;
                        "mcp-servers") tf_resource="module.security.google_service_account.mcp_servers" ;;
                        "cicd") tf_resource="module.security.google_service_account.cicd" ;;
                        "provision") tf_resource="module.security.google_service_account.provision_job" ;;
                    esac
                    terraform import "${TF_VARS[@]}" "$tf_resource" \
                        "projects/${PROJECT_ID}/serviceAccounts/${sa_email}" 2>/dev/null || true
                done
            fi

            if echo "$apply_output" | grep -q "Secret.*already exists"; then
                log_info "  Re-importing secrets..."
                # Already imported above, but retry any that failed
            fi

            # Retry terraform apply after imports
            log_step "Retrying terraform apply after import recovery (Issue #11)..."
            terraform apply -auto-approve \
                -var="region=$NEW_REGION" \
                -var="zone=$NEW_ZONE" \
                -var="env_id=$ENV_ID" \
                -var="project_id=$PROJECT_ID" \
                -var="recovery_mode=true" \
                -var="phoenix_mode=true" || {
                log_error "Terraform apply failed even after import recovery"
                log_error "Original error output:"
                echo "$apply_output" | tail -100
                exit 1
            }
            log_success "409 recovery successful - resources imported and apply completed"
        else
            log_error "Terraform apply failed:"
            echo "$apply_output" | tail -50
            exit 1
        fi
    fi

    log_success "Infrastructure deployed to $NEW_REGION"
}

# =============================================================================
# PHASE 3: REGENERATE SERVICE ACCOUNT KEY
# =============================================================================

phase3_regenerate_key() {
    log_phase "3" "REGENERATE SERVICE ACCOUNT KEY"

    local sa_email="tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com"
    local key_file="/tmp/recovery-key-$$.json"

    log_step "Creating new CICD service account key..."
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
        --secret=tamshai-prod-keycloak-admin-password 2>/dev/null || echo "")

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
    echo -e "${YELLOW}║     a) Use pre-configured auth-dr.tamshai.com (recommended)                  ║${NC}"
    echo -e "${YELLOW}║     b) Use raw Cloud Run URL: ${keycloak_host}${NC}"
    echo -e "${YELLOW}║     c) Wait for primary region recovery                                      ║${NC}"
    echo -e "${YELLOW}║                                                                              ║${NC}"
    echo -e "${YELLOW}║  3. Web Portal (if domain-mapped):                                           ║${NC}"
    echo -e "${YELLOW}║     Update CNAME or rebuild with new Keycloak URL:                           ║${NC}"
    echo -e "${YELLOW}║     VITE_KEYCLOAK_URL=https://auth-dr.tamshai.com/auth                       ║${NC}"
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
    cleanup_leftover_resources

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
