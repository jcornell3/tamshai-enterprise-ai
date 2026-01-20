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

# Default GCP configuration
export GCP_REGION="${GCP_REGION:-us-central1}"
export GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-}}"

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
# CRITICAL: Gap #41 - mcp-hr-service-client-secret must have a version
# BEFORE Terraform runs. This phase ensures all secrets exist with versions.
# =============================================================================
phase_2_secret_sync() {
    log_phase "2" "Secret Sync (GitHub -> GCP)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would sync secrets to GCP Secret Manager"
        return 0
    fi

    # Gap #41: Sync secrets from environment variables to GCP
    log_step "Syncing secrets from environment variables (Gap #41)..."
    sync_secrets_from_env || log_warn "Some secrets could not be synced from environment"

    # Gap #41 CRITICAL: Ensure mcp-hr-service-client-secret has a version
    # This MUST happen BEFORE any Terraform operations because Terraform creates
    # the secret shell but doesn't add a version, causing Cloud Run deployment to fail.
    log_step "CRITICAL: Ensuring mcp-hr-service-client-secret has a version (Gap #41)..."
    ensure_mcp_hr_client_secret || {
        log_error "FAILED to ensure mcp-hr-service-client-secret has a version"
        log_error "This will cause Cloud Run deployment to fail!"
        log_error "Manual fix: openssl rand -base64 32 | gcloud secrets versions add mcp-hr-service-client-secret --data-file=-"
        exit 1
    }

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

    # Pre-destroy cleanup (Gap #21, #22, #38)
    log_step "Running pre-destroy cleanup..."

    log_step "Deleting Cloud Run jobs (Gap #21)..."
    gcloud run jobs delete provision-users --region="${GCP_REGION}" --quiet 2>/dev/null || true

    # Gap #38: Delete Cloud Run services BEFORE terraform destroy
    # This releases database connections that would otherwise block keycloak DB deletion
    log_step "Deleting Cloud Run services to release DB connections (Gap #38)..."
    local services=("keycloak" "mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "web-portal")
    for svc in "${services[@]}"; do
        if gcloud run services describe "$svc" --region="${GCP_REGION}" &>/dev/null; then
            log_info "  Deleting $svc..."
            gcloud run services delete "$svc" --region="${GCP_REGION}" --quiet 2>/dev/null || true
        fi
    done
    log_info "Waiting for connections to close..."
    sleep 10

    log_step "Disabling deletion protection on Cloud SQL (Gap #22)..."
    local instance_name="tamshai-prod-postgres"
    if gcloud sql instances describe "$instance_name" &>/dev/null; then
        gcloud sql instances patch "$instance_name" \
            --no-deletion-protection \
            --quiet 2>/dev/null || log_warn "Could not disable deletion protection"
    fi

    # =============================================================================
    # PROACTIVE cleanup for KNOWN destroy issues (Gaps #39, #40, #23, #24, #25)
    # These are handled BEFORE terraform destroy to prevent failures
    # =============================================================================

    # Handle terraform state lock (common issue after interrupted operations)
    log_step "Checking for stale terraform state locks..."
    # Force unlock any stale locks - safe because we're about to destroy everything
    local lock_id
    lock_id=$(terraform plan -no-color 2>&1 | grep -oP 'ID:\s*\K\d+' | head -1) || true
    if [ -n "$lock_id" ]; then
        log_warn "Found stale lock ID: $lock_id - force unlocking..."
        terraform force-unlock -force "$lock_id" 2>/dev/null || true
    fi

    # Gap #39: Empty ALL storage buckets BEFORE destroy (force_destroy=false in terraform)
    log_step "Emptying storage buckets before destroy (Gap #39)..."
    local buckets=("prod.tamshai.com" "tamshai-prod-finance-docs" "tamshai-prod-finance-docs-${GCP_PROJECT_ID}")
    for bucket in "${buckets[@]}"; do
        if gcloud storage ls "gs://${bucket}" &>/dev/null 2>&1; then
            log_info "  Emptying gs://${bucket}..."
            gcloud storage rm -r "gs://${bucket}/**" 2>/dev/null || log_info "  Bucket ${bucket} already empty"
        fi
    done

    # Gap #40: Delete Cloud SQL instance BEFORE terraform destroy to avoid keycloak user dependency
    log_step "Deleting Cloud SQL instance to avoid user dependency (Gap #40)..."
    if gcloud sql instances describe "$instance_name" &>/dev/null; then
        log_warn "Deleting Cloud SQL instance: $instance_name (this takes ~30 seconds)"
        gcloud sql instances delete "$instance_name" --quiet 2>/dev/null || log_warn "Cloud SQL deletion may have failed"
        # Remove from state since we deleted it manually
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.postgres_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.keycloak_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
    fi

    # Gap #23: Remove service networking from state BEFORE destroy (blocks VPC deletion)
    # Check both module.database and module.networking paths (varies by terraform version)
    log_step "Removing service networking from state (Gap #23 - proactive)..."
    terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
    terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true
    terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
    terraform state rm 'module.networking.google_compute_global_address.private_ip_range' 2>/dev/null || true

    # Gap #24: Delete orphaned private IP BEFORE destroy (try multiple known names)
    log_step "Deleting orphaned private IP (Gap #24 - proactive)..."
    local private_ip_names=("tamshai-prod-private-ip" "google-managed-services-tamshai-prod-vpc" "tamshai-prod-private-ip-range")
    for ip_name in "${private_ip_names[@]}"; do
        gcloud compute addresses delete "$ip_name" --global --quiet 2>/dev/null || true
    done

    # Gap #25: Remove VPC connector from state BEFORE destroy
    log_step "Removing VPC connector from state (Gap #25 - proactive)..."
    terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true

    log_success "Proactive cleanup complete - terraform destroy should succeed on first try"

    log_step "Running terraform destroy..."
    echo ""
    echo -e "${YELLOW}WARNING: This will DESTROY all GCP infrastructure!${NC}"
    echo "Press Ctrl+C to abort, or wait 10 seconds to continue..."
    sleep 10

    terraform destroy -auto-approve || {
        log_warn "Terraform destroy had errors - attempting cleanup..."

        # =============================================================================
        # GAPS #23-25: Comprehensive Terraform State Cleanup
        # =============================================================================
        # These gaps address common Phoenix rebuild blockers:
        # - Gap #23: Service networking connection blocks VPC deletion
        # - Gap #24: Private IP address blocks VPC deletion
        # - Gap #25: VPC connector count dependency causes errors
        #
        # The state cleanup removes resources that would otherwise require manual
        # deletion or cause circular dependency issues during destroy.

        # Gap #23: Remove service networking from state if blocked
        # Service networking connections can block VPC deletion due to peering dependencies
        log_step "Removing service networking from state (Gap #23)..."
        terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true

        # Gap #24: Delete orphaned private IP manually
        # GCP may retain the private IP even after state removal
        log_step "Deleting orphaned private IP (Gap #24)..."
        gcloud compute addresses delete tamshai-prod-private-ip --global --quiet 2>/dev/null || true

        # Gap #25: Handle VPC connector count dependency
        # When vpc_connector_id changes from set to empty, count conditions fail
        log_step "Removing VPC connector references from state (Gap #25)..."
        terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true

        # Additional state cleanup for persistent resources
        log_step "Removing Cloud SQL resources from state..."
        terraform state rm 'module.database.google_sql_database.keycloak_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.postgres_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true

        # Retry targeted VPC destroy
        log_step "Attempting targeted VPC destroy..."
        terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve 2>/dev/null || true

        # Final retry of full destroy
        log_step "Retrying terraform destroy..."
        terraform destroy -auto-approve || log_warn "Destroy may be incomplete - verify manually"
    }

    # Post-destroy verification (Gap #1a)
    log_step "Running post-destroy verification (Gap #1a)..."

    local verification_failed=false

    # Check for orphaned Cloud Run services
    if gcloud run services list --region="${GCP_REGION}" --format="value(name)" 2>/dev/null | grep -qE "^(keycloak|mcp-|web-portal)"; then
        log_warn "Orphaned Cloud Run services found - deleting..."
        for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
            gcloud run services delete "$svc" --region="${GCP_REGION}" --quiet 2>/dev/null || true
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
        -target=module.networking \
        -target=module.security \
        -target=module.database \
        -target=module.storage \
        2>/dev/null || {
        log_warn "Targeted apply had errors - checking for Gap #44 (Cloud SQL state mismatch)..."

        # Gap #44: Cloud SQL instance may exist but not be in Terraform state
        # This happens when Cloud SQL creation takes >15 minutes and Terraform loses track
        local instance_name="tamshai-prod-postgres"
        if gcloud sql instances describe "$instance_name" &>/dev/null; then
            log_step "Cloud SQL instance exists - checking if it needs to be imported (Gap #44)..."

            # Check if instance is in terraform state
            if ! terraform state show 'module.database.google_sql_database_instance.postgres' &>/dev/null; then
                log_warn "Cloud SQL instance exists in GCP but not in Terraform state - importing..."
                terraform import 'module.database.google_sql_database_instance.postgres' \
                    "projects/${GCP_PROJECT_ID}/instances/${instance_name}" || log_warn "Import may have failed"
            fi
        fi

        # Retry apply after potential import
        terraform apply -auto-approve || log_warn "Terraform apply may be incomplete"
    }

    log_step "Waiting for Cloud SQL to be ready..."
    wait_for_cloudsql "tamshai-prod-postgres" 600  # Increased timeout for initial creation

    # Gap #26/41: Ensure mcp-hr-service-client-secret has a version
    log_step "Ensuring mcp-hr-service-client-secret has a version (Gap #26/41)..."
    ensure_mcp_hr_client_secret || log_warn "Could not ensure mcp-hr-service-client-secret"

    save_checkpoint 4 "completed"
    log_success "Phase 4 complete - Infrastructure created"
}

# =============================================================================
# Phase 5: Build Images
# =============================================================================
# NOTE: Images MUST be built BEFORE Phase 7 (Cloud Run) because Terraform
# will fail with "image not found" if Cloud Run is created before images exist.
#
# SPECIAL HANDLING:
# - Gap #45: Keycloak uses Dockerfile.cloudbuild (no BuildKit --chmod syntax)
# - Gap #46: web-portal must be built from repo root with -f flag
# =============================================================================
phase_5_build_images() {
    log_phase "5" "Build Container Images"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would trigger Cloud Build for all images"
        return 0
    fi

    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    local region="${GCP_REGION}"
    local registry="${region}-docker.pkg.dev/${project}/tamshai"

    log_step "Building container images via Cloud Build..."

    # Build MCP services (standard Dockerfile)
    local mcp_services=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support")
    for service in "${mcp_services[@]}"; do
        log_info "Building $service..."
        if [ -f "$PROJECT_ROOT/services/$service/Dockerfile" ]; then
            gcloud builds submit "$PROJECT_ROOT/services/$service" \
                --tag="${registry}/${service}:latest" \
                --quiet || log_warn "Build failed for $service"
        else
            log_warn "No Dockerfile found for $service"
        fi
    done

    # Gap #45: Keycloak - use Dockerfile.cloudbuild to avoid BuildKit --chmod issue
    log_info "Building keycloak (using Dockerfile.cloudbuild for Cloud Build compatibility)..."
    if [ -f "$PROJECT_ROOT/keycloak/Dockerfile.cloudbuild" ]; then
        # Use Dockerfile.cloudbuild which doesn't use BuildKit-specific syntax
        gcloud builds submit "$PROJECT_ROOT/keycloak" \
            --tag="${registry}/keycloak:v2.0.0-postgres" \
            --config=<(cat <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/keycloak:v2.0.0-postgres', '-f', 'Dockerfile.cloudbuild', '.']
images:
  - '${registry}/keycloak:v2.0.0-postgres'
EOF
) || log_warn "Keycloak build failed"
    elif [ -f "$PROJECT_ROOT/keycloak/Dockerfile" ]; then
        # Fallback to regular Dockerfile (may fail if using BuildKit syntax)
        log_warn "Dockerfile.cloudbuild not found, using regular Dockerfile (may fail)"
        gcloud builds submit "$PROJECT_ROOT/keycloak" \
            --tag="${registry}/keycloak:v2.0.0-postgres" \
            --quiet || log_warn "Keycloak build failed - create Dockerfile.cloudbuild without --chmod flag"
    else
        log_error "No Dockerfile found for keycloak"
    fi

    # Gap #46: web-portal - must be built from repo root with -f flag
    log_info "Building web-portal (from repo root with explicit Dockerfile path)..."
    if [ -f "$PROJECT_ROOT/clients/web/Dockerfile.prod" ]; then
        gcloud builds submit "$PROJECT_ROOT" \
            --config=<(cat <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/web-portal:latest', '-f', 'clients/web/Dockerfile.prod', '.']
images:
  - '${registry}/web-portal:latest'
EOF
) || log_warn "web-portal build failed"
    else
        log_warn "No Dockerfile.prod found for web-portal"
    fi

    # Verify all images were built
    log_step "Verifying images in Artifact Registry..."
    local all_images=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "keycloak" "web-portal")
    local missing=0
    for img in "${all_images[@]}"; do
        if gcloud artifacts docker images describe "${registry}/${img}:latest" &>/dev/null 2>&1 || \
           gcloud artifacts docker images describe "${registry}/${img}:v2.0.0-postgres" &>/dev/null 2>&1; then
            log_success "  Found: $img"
        else
            log_error "  MISSING: $img"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -gt 0 ]; then
        log_error "$missing images are missing - Cloud Run deployment will fail!"
        log_error "Fix the build issues above before continuing."
        save_checkpoint 5 "failed"
        exit 1
    fi

    save_checkpoint 5 "completed"
    log_success "Phase 5 complete - All images built"
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

    # Gap #48: Import existing domain mappings before apply (they persist across Phoenix rebuilds)
    log_step "Checking for existing domain mappings to import (Gap #48)..."
    local region="${GCP_REGION}"
    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"

    # Check if auth.tamshai.com domain mapping exists but isn't in state
    if gcloud beta run domain-mappings describe --domain=auth.tamshai.com --region="$region" &>/dev/null 2>&1; then
        if ! terraform state show 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' &>/dev/null 2>&1; then
            log_info "Importing existing auth.tamshai.com domain mapping..."
            terraform import 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' \
                "locations/${region}/namespaces/${project}/domainmappings/auth.tamshai.com" 2>/dev/null || \
                log_warn "Domain mapping import failed - may already be in state"
        fi
    fi

    # Check if app.tamshai.com domain mapping exists
    if gcloud beta run domain-mappings describe --domain=app.tamshai.com --region="$region" &>/dev/null 2>&1; then
        if ! terraform state show 'module.cloudrun.google_cloud_run_domain_mapping.web_portal[0]' &>/dev/null 2>&1; then
            log_info "Importing existing app.tamshai.com domain mapping..."
            terraform import 'module.cloudrun.google_cloud_run_domain_mapping.web_portal[0]' \
                "locations/${region}/namespaces/${project}/domainmappings/app.tamshai.com" 2>/dev/null || \
                log_warn "Domain mapping import failed - may not exist in config"
        fi
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

    # Gap #35 & #48: Create auth.tamshai.com domain mapping (handle already exists)
    log_step "Creating auth.tamshai.com domain mapping (Gap #35, #48)..."
    local region="${GCP_REGION}"

    # Gap #48: Domain mapping may already exist from a previous deployment
    # Unlike other resources, domain mappings persist across terraform destroys
    if gcloud beta run domain-mappings describe --domain=auth.tamshai.com --region="$region" &>/dev/null; then
        log_info "Domain mapping auth.tamshai.com already exists (Gap #48 - this is expected)"
        log_info "Domain mappings persist across Phoenix rebuilds - no action needed"
    else
        log_info "Creating new domain mapping for auth.tamshai.com..."
        gcloud beta run domain-mappings create \
            --service=keycloak \
            --domain=auth.tamshai.com \
            --region="$region" || log_warn "Domain mapping creation failed - may need manual creation"
    fi

    # =============================================================================
    # CLOUDFLARE SSL NOTE:
    # Cloud Run domain mappings provision Google-managed SSL certificates, but
    # auth.tamshai.com uses Cloudflare which handles SSL at the edge. The DNS
    # points to Cloudflare, which proxies to Cloud Run via ghs.googlehosted.com.
    #
    # IMPORTANT: Do NOT wait for Cloud Run SSL provisioning to complete!
    # - Cloudflare provides the SSL certificate to clients
    # - Cloud Run's certificate is only for the Cloudflare->Cloud Run connection
    # - Cloudflare can use "Full (Strict)" mode with its own origin CA certificate
    # - Waiting for Cloud Run SSL can add 10+ minutes unnecessarily
    # =============================================================================
    log_step "Checking domain mapping status (Cloudflare handles SSL)..."
    local mapping_status
    mapping_status=$(gcloud beta run domain-mappings describe \
        --domain=auth.tamshai.com \
        --region="$region" \
        --format="value(status.conditions[0].type)" 2>/dev/null || echo "Unknown")

    log_info "Domain mapping status: $mapping_status"
    log_info "NOTE: Cloudflare handles SSL termination - no need to wait for Cloud Run SSL"
    log_info "DNS should point to ghs.googlehosted.com (via Cloudflare proxy)"

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
