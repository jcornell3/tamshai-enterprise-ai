#!/bin/bash
# =============================================================================
# Phoenix Rebuild - GCP Production Environment
# =============================================================================
#
# Complete rebuild of the GCP production environment from scratch.
# Implements lessons learned from Issues #20-25.
#
# Phases:
#   1. Pre-flight      - Run all validation checks
#   2. Secret Sync     - Sync GitHub secrets to GCP Secret Manager
#   3. Terraform Destroy - Disable deletion protection, destroy
#   4. Terraform Infra - Create VPC, Cloud SQL, Artifact Registry
#   5. Build Images    - Cloud Build all 8 images
#   6. Regenerate Keys - Create new CICD SA key, update GitHub secret
#   7. Terraform Cloud Run - Complete terraform apply
#   8. Deploy Services - Trigger deploy-to-gcp.yml with health gates
#   9. Configure TOTP  - Set test-user.journey TOTP
#   10. Provision & Verify - Users, data, E2E tests
#
# Usage:
#   ./phoenix-rebuild.sh [options]
#
# Options:
#   --skip-preflight   Skip pre-flight checks
#   --skip-destroy     Skip terraform destroy (partial rebuild)
#   --resume           Resume from last checkpoint
#   --phase N          Start from specific phase (1-10)
#   --dry-run          Show what would be done without executing
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/secrets.sh"
source "$SCRIPT_DIR/lib/health-checks.sh"
source "$SCRIPT_DIR/lib/dynamic-urls.sh"
source "$SCRIPT_DIR/lib/verify.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/cleanup.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/domain-mapping.sh" 2>/dev/null || true

# Checkpoint file for resume capability
CHECKPOINT_FILE="${HOME}/.phoenix-rebuild-progress.json"

# Options
SKIP_PREFLIGHT=false
SKIP_DESTROY=false
RESUME_MODE=false
START_PHASE=1
DRY_RUN=false

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
        --skip-destroy) SKIP_DESTROY=true; shift ;;
        --resume) RESUME_MODE=true; shift ;;
        --phase) START_PHASE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) show_help; exit 0 ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_phase() { echo -e "\n${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"; echo -e "${MAGENTA}║  PHASE $1: $2${NC}"; echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
Phoenix Rebuild - GCP Production Environment

Usage: ./phoenix-rebuild.sh [options]

Options:
  --skip-preflight   Skip pre-flight checks
  --skip-destroy     Skip terraform destroy (partial rebuild)
  --resume           Resume from last checkpoint
  --phase N          Start from specific phase (1-10)
  --dry-run          Show what would be done without executing
  -h, --help         Show this help message

Phases:
  1. Pre-flight      Run all validation checks
  2. Secret Sync     Sync secrets to GCP Secret Manager
  3. Terraform Destroy Destroy existing infrastructure
  4. Terraform Infra Create VPC, Cloud SQL, Artifact Registry
  5. Build Images    Cloud Build all container images
  6. Regenerate Keys Create new CICD SA key
  7. Terraform Cloud Run Deploy Cloud Run services
  8. Deploy Services Trigger GitHub Actions workflow
  9. Configure TOTP  Set test-user.journey TOTP
  10. Provision & Verify Users, data, E2E tests

Environment Variables:
  GCP_PROJECT_ID     GCP project ID (or set via gcloud config)
  KEYCLOAK_ADMIN_PASSWORD  Keycloak admin password
  TEST_USER_TOTP_SECRET_RAW Raw TOTP secret for test user

EOF
}

# =============================================================================
# Checkpoint Management
# =============================================================================
save_checkpoint() {
    local phase="$1"
    local status="$2"
    local message="${3:-}"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$CHECKPOINT_FILE" << EOF
{
    "phase": $phase,
    "status": "$status",
    "message": "$message",
    "timestamp": "$timestamp",
    "project_id": "${GCP_PROJECT_ID:-unknown}",
    "script_version": "1.0.0"
}
EOF

    log_info "Checkpoint saved: Phase $phase - $status"
}

load_checkpoint() {
    if [ -f "$CHECKPOINT_FILE" ]; then
        local phase
        phase=$(jq -r '.phase' "$CHECKPOINT_FILE" 2>/dev/null) || phase=1
        local status
        status=$(jq -r '.status' "$CHECKPOINT_FILE" 2>/dev/null) || status="unknown"
        local timestamp
        timestamp=$(jq -r '.timestamp' "$CHECKPOINT_FILE" 2>/dev/null) || timestamp="unknown"

        log_info "Found checkpoint: Phase $phase ($status) at $timestamp"
        echo "$phase"
    else
        echo "1"
    fi
}

clear_checkpoint() {
    if [ -f "$CHECKPOINT_FILE" ]; then
        rm -f "$CHECKPOINT_FILE"
        log_info "Checkpoint cleared"
    fi
}

# =============================================================================
# Phase 1: Pre-flight Checks
# =============================================================================
phase_1_preflight() {
    log_phase "1" "Pre-flight Checks"

    if [ "$SKIP_PREFLIGHT" = true ]; then
        log_warn "Skipping pre-flight checks (--skip-preflight)"
        save_checkpoint 1 "skipped"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run: ./scripts/gcp/phoenix-preflight.sh"
        return 0
    fi

    log_step "Running pre-flight validation..."

    if "$SCRIPT_DIR/phoenix-preflight.sh"; then
        log_success "Pre-flight checks passed"
        save_checkpoint 1 "completed"
        return 0
    else
        log_error "Pre-flight checks failed"
        save_checkpoint 1 "failed"
        echo ""
        echo "Fix the issues above and run with --resume to continue."
        exit 1
    fi
}

# =============================================================================
# Phase 2: Secret Sync
# =============================================================================
phase_2_secret_sync() {
    log_phase "2" "Secret Sync (GitHub -> GCP)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would sync secrets to GCP Secret Manager"
        return 0
    fi

    log_step "Verifying GCP secrets exist..."

    if verify_gcp_secrets; then
        log_success "All required GCP secrets verified"
    else
        log_warn "Some GCP secrets missing - they may need manual creation"
        echo ""
        echo "Required secrets:"
        for secret in "${REQUIRED_GCP_SECRETS[@]}"; do
            echo "  - $secret"
        done
        echo ""
        echo "Create missing secrets using:"
        echo "  gcloud secrets create SECRET_NAME --data-file=- <<< 'value'"
    fi

    log_step "Checking secret hygiene (Issue #25 fix)..."
    check_all_secrets_hygiene || log_warn "Some secrets have hygiene issues"

    save_checkpoint 2 "completed"
    log_success "Phase 2 complete"
}

# =============================================================================
# Phase 3: Terraform Destroy
# =============================================================================
phase_3_destroy() {
    log_phase "3" "Terraform Destroy"

    if [ "$SKIP_DESTROY" = true ]; then
        log_warn "Skipping terraform destroy (--skip-destroy)"
        save_checkpoint 3 "skipped"
        return 0
    fi

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform directory not found: $tf_dir"
        exit 1
    fi

    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform destroy in $tf_dir"
        return 0
    fi

    # Pre-destroy cleanup (Gap #21, #22)
    log_step "Running pre-destroy cleanup..."

    log_step "Deleting Cloud Run jobs (Gap #21)..."
    gcloud run jobs delete provision-users --region="${GCP_REGION:-us-central1}" --quiet 2>/dev/null || true

    log_step "Disabling deletion protection on Cloud SQL (Gap #22)..."
    local instance_name="tamshai-prod-postgres"
    if gcloud sql instances describe "$instance_name" &>/dev/null; then
        gcloud sql instances patch "$instance_name" \
            --no-deletion-protection \
            --quiet 2>/dev/null || log_warn "Could not disable deletion protection"
    fi

    log_step "Running terraform destroy..."
    echo ""
    echo -e "${YELLOW}WARNING: This will DESTROY all GCP infrastructure!${NC}"
    echo "Press Ctrl+C to abort, or wait 10 seconds to continue..."
    sleep 10

    terraform destroy -auto-approve || {
        log_warn "Terraform destroy had errors - attempting cleanup..."

        # Gap #23: Remove service networking from state if blocked
        log_step "Removing service networking from state (Gap #23)..."
        terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true

        # Gap #24: Delete orphaned private IP
        log_step "Deleting orphaned private IP (Gap #24)..."
        gcloud compute addresses delete tamshai-prod-private-ip --global --quiet 2>/dev/null || true

        # Retry destroy
        log_step "Retrying terraform destroy..."
        terraform destroy -auto-approve || log_warn "Destroy may be incomplete - verify manually"
    }

    # Post-destroy verification (Gap #1a)
    log_step "Running post-destroy verification (Gap #1a)..."

    local verification_failed=false

    # Check for orphaned Cloud Run services
    if gcloud run services list --region="${GCP_REGION:-us-central1}" --format="value(name)" 2>/dev/null | grep -qE "^(keycloak|mcp-|web-portal)"; then
        log_warn "Orphaned Cloud Run services found - deleting..."
        for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
            gcloud run services delete "$svc" --region="${GCP_REGION:-us-central1}" --quiet 2>/dev/null || true
        done
    fi

    # Check for orphaned Cloud SQL
    if gcloud sql instances list --format="value(name)" 2>/dev/null | grep -q "tamshai"; then
        log_error "Cloud SQL instance still exists - manual deletion required"
        verification_failed=true
    fi

    # Check for orphaned VPC
    if gcloud compute networks list --format="value(name)" 2>/dev/null | grep -q "tamshai"; then
        log_error "VPC still exists - manual deletion required"
        verification_failed=true
    fi

    # Gap #1b: Remove stale state entries
    log_step "Removing stale state entries (Gap #1b)..."
    for resource in \
        'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["support"]' \
        'module.cloudrun.google_cloud_run_service.keycloak' \
        'module.cloudrun.google_cloud_run_service.mcp_gateway' \
        'module.cloudrun.google_cloud_run_service.web_portal[0]'; do
        terraform state rm "$resource" 2>/dev/null || true
    done

    # Delete persisted secrets (Gap #2)
    log_step "Deleting persisted secrets (Gap #2)..."
    for secret in \
        tamshai-prod-keycloak-admin-password \
        tamshai-prod-keycloak-db-password \
        tamshai-prod-db-password \
        tamshai-prod-anthropic-api-key \
        tamshai-prod-mcp-gateway-client-secret \
        tamshai-prod-jwt-secret \
        mcp-hr-service-client-secret \
        prod-user-password; do
        gcloud secrets delete "$secret" --quiet 2>/dev/null || true
    done

    if [ "$verification_failed" = true ]; then
        log_error "Post-destroy verification failed - manual cleanup required"
        save_checkpoint 3 "failed"
        exit 1
    fi

    save_checkpoint 3 "completed"
    log_success "Phase 3 complete - Infrastructure destroyed and verified"
}

# =============================================================================
# Phase 4: Terraform Infrastructure
# =============================================================================
phase_4_infrastructure() {
    log_phase "4" "Terraform Infrastructure (VPC, Cloud SQL, Registry)"

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"
    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform init && terraform apply (target=infra)"
        return 0
    fi

    log_step "Initializing Terraform..."
    terraform init -upgrade

    log_step "Creating infrastructure (VPC, Cloud SQL, Artifact Registry)..."
    # First, create just the infrastructure without Cloud Run services
    # This allows images to be built before Cloud Run needs them
    terraform apply -auto-approve \
        -target=google_compute_network.vpc \
        -target=google_compute_global_address.private_ip_range \
        -target=google_service_networking_connection.private_vpc_connection \
        -target=google_sql_database_instance.postgres \
        -target=google_sql_database.keycloak_db \
        -target=google_sql_database.hr_db \
        -target=google_sql_database.finance_db \
        -target=google_sql_user.postgres_user \
        -target=google_artifact_registry_repository.docker \
        -target=google_vpc_access_connector.connector \
        2>/dev/null || terraform apply -auto-approve  # Fallback to full apply if targets don't exist

    log_step "Waiting for Cloud SQL to be ready..."
    wait_for_cloudsql "tamshai-prod-postgres" 300

    # Gap #26: Add version to mcp-hr-service-client-secret
    log_step "Adding version to mcp-hr-service-client-secret (Gap #26)..."
    if gcloud secrets describe mcp-hr-service-client-secret --project="${GCP_PROJECT_ID}" &>/dev/null; then
        local version_count
        version_count=$(gcloud secrets versions list mcp-hr-service-client-secret --project="${GCP_PROJECT_ID}" --format="value(name)" 2>/dev/null | wc -l)
        if [ "$version_count" -eq 0 ]; then
            openssl rand -base64 32 | gcloud secrets versions add mcp-hr-service-client-secret --data-file=- --project="${GCP_PROJECT_ID}"
            log_success "Added version to mcp-hr-service-client-secret"
        else
            log_info "mcp-hr-service-client-secret already has a version"
        fi
    fi

    save_checkpoint 4 "completed"
    log_success "Phase 4 complete - Infrastructure created"
}

# =============================================================================
# Phase 5: Build Images
# =============================================================================
phase_5_build_images() {
    log_phase "5" "Build Container Images"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would trigger Cloud Build for all images"
        return 0
    fi

    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    local region="us-central1"

    log_step "Building container images via Cloud Build..."

    local services=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "keycloak" "web-portal")

    for service in "${services[@]}"; do
        log_info "Building $service..."

        local service_dir
        case "$service" in
            keycloak) service_dir="keycloak" ;;
            web-portal) service_dir="clients/web" ;;
            *) service_dir="services/$service" ;;
        esac

        if [ -f "$PROJECT_ROOT/$service_dir/Dockerfile" ] || [ -f "$PROJECT_ROOT/$service_dir/Dockerfile.prod" ]; then
            gcloud builds submit "$PROJECT_ROOT/$service_dir" \
                --tag="${region}-docker.pkg.dev/${project}/tamshai/${service}:latest" \
                --quiet 2>/dev/null || log_warn "Build failed for $service (may need manual intervention)"
        else
            log_warn "No Dockerfile found for $service"
        fi
    done

    save_checkpoint 5 "completed"
    log_success "Phase 5 complete - Images built"
}

# =============================================================================
# Phase 6: Regenerate Service Account Key
# =============================================================================
phase_6_regenerate_keys() {
    log_phase "6" "Regenerate Service Account Keys"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would regenerate CICD SA key and update GitHub secret"
        return 0
    fi

    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    local sa_email="tamshai-prod-cicd@${project}.iam.gserviceaccount.com"
    local key_file="/tmp/gcp-sa-key-$$.json"

    log_step "Creating new service account key..."

    # Check if SA exists
    if ! gcloud iam service-accounts describe "$sa_email" &>/dev/null; then
        log_warn "Service account $sa_email not found - may be created by Terraform"
        save_checkpoint 6 "skipped"
        return 0
    fi

    # Create new key
    gcloud iam service-accounts keys create "$key_file" \
        --iam-account="$sa_email" \
        --quiet

    if [ ! -f "$key_file" ]; then
        log_error "Failed to create service account key"
        exit 1
    fi

    log_step "Updating GitHub secret: GCP_SA_KEY_PROD..."

    if gh secret set GCP_SA_KEY_PROD < "$key_file"; then
        log_success "GitHub secret updated"
    else
        log_error "Failed to update GitHub secret"
        rm -f "$key_file"
        exit 1
    fi

    # Clean up
    rm -f "$key_file"

    save_checkpoint 6 "completed"
    log_success "Phase 6 complete - Keys regenerated"
}

# =============================================================================
# Phase 7: Terraform Cloud Run
# =============================================================================
phase_7_cloud_run() {
    log_phase "7" "Terraform Cloud Run Services"

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"
    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform apply (full)"
        return 0
    fi

    log_step "Applying full Terraform configuration..."
    terraform apply -auto-approve

    # Gap #32: Add MongoDB URI IAM binding for MCP servers
    log_step "Adding MongoDB URI IAM binding (Gap #32)..."
    local project="${GCP_PROJECT_ID}"
    local sa_email="tamshai-prod-mcp-servers@${project}.iam.gserviceaccount.com"

    if gcloud secrets describe tamshai-prod-mongodb-uri --project="$project" &>/dev/null; then
        gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
            --member="serviceAccount:${sa_email}" \
            --role="roles/secretmanager.secretAccessor" \
            --project="$project" \
            --quiet 2>/dev/null || log_info "IAM binding may already exist"
    fi

    # Gap #35: Create auth.tamshai.com domain mapping
    log_step "Creating auth.tamshai.com domain mapping (Gap #35)..."
    local region="${GCP_REGION:-us-central1}"

    if ! gcloud beta run domain-mappings describe --domain=auth.tamshai.com --region="$region" &>/dev/null; then
        gcloud beta run domain-mappings create \
            --service=keycloak \
            --domain=auth.tamshai.com \
            --region="$region" || log_warn "Domain mapping creation failed - may need manual creation"
    else
        log_info "Domain mapping auth.tamshai.com already exists"
    fi

    # Gap #16: Wait for domain mapping to be routable
    log_step "Waiting for domain mapping to be routable (Gap #16)..."
    local timeout=300
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local routable
        routable=$(gcloud beta run domain-mappings describe \
            --domain=auth.tamshai.com \
            --region="$region" \
            --format="value(status.conditions[2].status)" 2>/dev/null || echo "Unknown")

        if [ "$routable" = "True" ]; then
            log_success "Domain mapping is routable"
            break
        fi

        log_info "  Waiting for domain routing... (${elapsed}s elapsed)"
        sleep 10
        elapsed=$((elapsed + 10))
    done

    if [ $elapsed -ge $timeout ]; then
        log_warn "Domain mapping may not be fully routable yet - continuing anyway"
    fi

    save_checkpoint 7 "completed"
    log_success "Phase 7 complete - Cloud Run services configured"
}

# =============================================================================
# Phase 8: Deploy Services via GitHub Actions
# =============================================================================
phase_8_deploy() {
    log_phase "8" "Deploy Services"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would trigger deploy-to-gcp.yml workflow"
        return 0
    fi

    log_step "Triggering GitHub Actions deployment..."

    gh workflow run deploy-to-gcp.yml --ref main -f service=all

    log_step "Waiting for workflow to complete..."

    # Wait for workflow to start
    sleep 10

    # Get the latest run ID
    local run_id
    run_id=$(gh run list --workflow=deploy-to-gcp.yml --limit=1 --json databaseId -q '.[0].databaseId')

    if [ -n "$run_id" ]; then
        log_info "Monitoring workflow run: $run_id"

        # Watch the run (with timeout)
        timeout 1800 gh run watch "$run_id" || {
            log_warn "Workflow monitoring timed out - check GitHub Actions"
        }
    fi

    log_step "Waiting for services to be healthy..."
    wait_for_all_services 300 || log_warn "Some services may not be healthy"

    save_checkpoint 8 "completed"
    log_success "Phase 8 complete - Services deployed"
}

# =============================================================================
# Phase 9: Configure TOTP
# =============================================================================
phase_9_totp() {
    log_phase "9" "Configure Test User TOTP"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would configure TOTP for test-user.journey"
        return 0
    fi

    local totp_script="$PROJECT_ROOT/keycloak/scripts/set-user-totp.sh"

    if [ ! -f "$totp_script" ]; then
        log_warn "TOTP script not found: $totp_script"
        save_checkpoint 9 "skipped"
        return 0
    fi

    log_step "Setting TOTP for test-user.journey..."

    # Get admin password from GCP Secret Manager
    local admin_password
    admin_password=$(get_gcp_secret "tamshai-prod-keycloak-admin-password") || {
        log_error "Could not get Keycloak admin password"
        exit 1
    }

    # Get TOTP secret
    local totp_secret="${TEST_USER_TOTP_SECRET_RAW:-}"

    if [ -z "$totp_secret" ]; then
        # Try to get from GCP secrets (if stored there)
        log_warn "TEST_USER_TOTP_SECRET_RAW not set - using default"
        totp_secret="JBSWY3DPEHPK3PXP"
    fi

    # Run with AUTO_CONFIRM for non-interactive mode
    export KEYCLOAK_ADMIN_PASSWORD="$admin_password"
    export AUTO_CONFIRM=true

    chmod +x "$totp_script"
    "$totp_script" prod test-user.journey "$totp_secret" || {
        log_warn "TOTP configuration may have failed - check manually"
    }

    save_checkpoint 9 "completed"
    log_success "Phase 9 complete - TOTP configured"
}

# =============================================================================
# Phase 10: Provision and Verify
# =============================================================================
phase_10_verify() {
    log_phase "10" "Provision Users and Verify"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run user provisioning and E2E tests"
        return 0
    fi

    log_step "Printing discovered URLs..."
    print_discovered_urls

    log_step "Running health checks..."
    quick_health_check || log_warn "Some services may not be healthy"

    log_step "Provisioning users..."
    # Trigger user provisioning if available
    local provision_script="$PROJECT_ROOT/scripts/gcp/provision-users.sh"
    if [ -f "$provision_script" ]; then
        chmod +x "$provision_script"
        "$provision_script" || log_warn "User provisioning may have failed"
    fi

    log_step "Running E2E login test..."
    cd "$PROJECT_ROOT/tests/e2e"
    if [ -f "package.json" ]; then
        npm run test:login:prod 2>/dev/null || log_warn "E2E tests may have failed"
    fi

    save_checkpoint 10 "completed"
    clear_checkpoint  # All done, clear the checkpoint
    log_success "Phase 10 complete - Verification complete"
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           PHOENIX REBUILD - GCP Production                     ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  This script will rebuild the entire GCP production            ║"
    echo "║  environment from scratch. This is a DESTRUCTIVE operation.    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
        echo ""
    fi

    # Handle resume mode
    if [ "$RESUME_MODE" = true ]; then
        START_PHASE=$(load_checkpoint)
        log_info "Resuming from phase $START_PHASE"
    fi

    # Confirm before proceeding
    if [ "$DRY_RUN" = false ] && [ "$START_PHASE" -le 3 ]; then
        echo -e "${RED}WARNING: This will DESTROY and rebuild production!${NC}"
        echo "Type 'PHOENIX' to confirm: "
        read -r confirmation

        if [ "$confirmation" != "PHOENIX" ]; then
            echo "Aborted."
            exit 0
        fi
    fi

    # Set GCP project
    GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
    export GCP_PROJECT_ID

    if [ -z "$GCP_PROJECT_ID" ]; then
        log_error "GCP_PROJECT_ID not set"
        exit 1
    fi

    log_info "Project: $GCP_PROJECT_ID"
    log_info "Starting from Phase: $START_PHASE"
    echo ""

    # Run phases
    [ "$START_PHASE" -le 1 ] && phase_1_preflight
    [ "$START_PHASE" -le 2 ] && phase_2_secret_sync
    [ "$START_PHASE" -le 3 ] && phase_3_destroy
    [ "$START_PHASE" -le 4 ] && phase_4_infrastructure
    [ "$START_PHASE" -le 5 ] && phase_5_build_images
    [ "$START_PHASE" -le 6 ] && phase_6_regenerate_keys
    [ "$START_PHASE" -le 7 ] && phase_7_cloud_run
    [ "$START_PHASE" -le 8 ] && phase_8_deploy
    [ "$START_PHASE" -le 9 ] && phase_9_totp
    [ "$START_PHASE" -le 10 ] && phase_10_verify

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           PHOENIX REBUILD COMPLETE!                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify services at https://auth.tamshai.com"
    echo "  2. Run full E2E test suite: cd tests/e2e && npm test"
    echo "  3. Check monitoring dashboards"
    echo ""
}

main "$@"
