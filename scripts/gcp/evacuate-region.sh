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
#   ./evacuate-region.sh [NEW_REGION] [NEW_ZONE] [ENV_ID]
#
# Examples:
#   ./evacuate-region.sh                                    # us-west1, auto-generated ID
#   ./evacuate-region.sh us-west1 us-west1-b recovery-01    # Specific region and ID
#   ./evacuate-region.sh us-east1 us-east1-b                # East coast, auto-generated ID
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
# CONFIGURATION
# =============================================================================

NEW_REGION="${1:-us-west1}"
NEW_ZONE="${2:-${NEW_REGION}-b}"
ENV_ID="${3:-recovery-$(date +%Y%m%d-%H%M)}"

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

    read -p "Proceed with regional evacuation? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Evacuation cancelled"
        exit 0
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

    log_success "Terraform initialized with fresh state"
}

# =============================================================================
# PHASE 2: DEPLOY INFRASTRUCTURE TO NEW REGION
# =============================================================================

phase2_deploy_infrastructure() {
    log_phase "2" "DEPLOY INFRASTRUCTURE TO NEW REGION"

    cd "$TF_DIR"

    log_step "Planning infrastructure deployment..."
    terraform plan \
        -var="region=$NEW_REGION" \
        -var="zone=$NEW_ZONE" \
        -var="env_id=$ENV_ID" \
        -var="project_id=$PROJECT_ID" \
        -var="recovery_mode=true" \
        -var="phoenix_mode=true" \
        -out=recovery.tfplan

    log_step "Applying infrastructure (this may take 15-20 minutes)..."
    terraform apply -auto-approve recovery.tfplan

    # Clean up plan file
    rm -f recovery.tfplan

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

    phase1_init_state
    phase2_deploy_infrastructure
    phase3_regenerate_key
    phase4_deploy_services
    phase5_configure_test_user
    phase6_verify

    local end_time duration_min
    end_time=$(date +%s)
    duration_min=$(( (end_time - start_time) / 60 ))

    show_summary

    log_success "Regional evacuation completed in ${duration_min} minutes"
}

# Run main
main "$@"
