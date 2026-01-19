#!/bin/bash
# =============================================================================
# User Provisioning via Cloud Run Job
# =============================================================================
#
# Builds and runs the user provisioning Cloud Run Job.
# This job has VPC access and can connect to private IP Cloud SQL.
#
# Usage:
#   ./provision-users-job.sh [action] [options]
#
# Actions:
#   build       - Build and push the container image only
#   run         - Run the provisioning job (image must exist)
#   all         - Build image and run job
#   verify-only - Run job in verify-only mode (default)
#   load-hr     - Load HR data only
#   sync-users  - Sync users to Keycloak only
#
# Options:
#   --dry-run              - Preview without making changes
#   --force-password-reset - Reset passwords for existing users
#   --wait                 - Wait for job completion (default: true)
#
# Examples:
#   ./provision-users-job.sh build
#   ./provision-users-job.sh run verify-only
#   ./provision-users-job.sh all --dry-run
#   ./provision-users-job.sh run sync-users --force-password-reset
#
# =============================================================================

set -e

# Configuration (required - no defaults)
PROJECT_ID="${GCP_PROJECT:?GCP_PROJECT environment variable is required}"
REGION="${GCP_REGION:?GCP_REGION environment variable is required}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
JOB_NAME="provision-users"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai-${ENVIRONMENT}/provision-job"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Default values
ACTION="verify-only"
DRY_RUN="false"
FORCE_PASSWORD_RESET="false"
WAIT_FOR_COMPLETION="true"
BUILD_ONLY="false"
RUN_ONLY="false"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    grep '^#' "$0" | grep -v '#!/' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        build)
            BUILD_ONLY="true"
            shift
            ;;
        run)
            RUN_ONLY="true"
            shift
            ;;
        all)
            BUILD_ONLY="false"
            RUN_ONLY="false"
            ACTION="${2:-all}"
            shift
            [[ "$1" != --* ]] && shift
            ;;
        verify-only|load-hr|sync-users|load-hr-data)
            ACTION="$1"
            [[ "$1" == "load-hr" ]] && ACTION="load-hr-data"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --force-password-reset)
            FORCE_PASSWORD_RESET="true"
            shift
            ;;
        --wait)
            WAIT_FOR_COMPLETION="true"
            shift
            ;;
        --no-wait)
            WAIT_FOR_COMPLETION="false"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Print configuration
echo "=============================================="
echo "User Provisioning Job"
echo "=============================================="
echo "Project:              $PROJECT_ID"
echo "Region:               $REGION"
echo "Job Name:             $JOB_NAME"
echo "Image:                $IMAGE_NAME:$IMAGE_TAG"
echo "Action:               $ACTION"
echo "Dry Run:              $DRY_RUN"
echo "Force Password Reset: $FORCE_PASSWORD_RESET"
echo "=============================================="

# Build the container image
build_image() {
    log_info "Building container image..."

    # Get the repo root
    REPO_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)

    # Configure Docker for Artifact Registry
    log_info "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

    # Build the image
    log_info "Building Docker image..."
    docker build \
        -t "${IMAGE_NAME}:${IMAGE_TAG}" \
        -f "${REPO_ROOT}/scripts/gcp/provision-job/Dockerfile" \
        "${REPO_ROOT}"

    # Push the image
    log_info "Pushing image to Artifact Registry..."
    docker push "${IMAGE_NAME}:${IMAGE_TAG}"

    log_info "Image built and pushed: ${IMAGE_NAME}:${IMAGE_TAG}"
}

# Run the Cloud Run Job
run_job() {
    log_info "Running provisioning job..."

    # Check if job exists
    if ! gcloud run jobs describe "$JOB_NAME" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Job '$JOB_NAME' not found. Run 'terraform apply' first to create the job."
        exit 1
    fi

    # Build execution command
    EXEC_CMD="gcloud run jobs execute $JOB_NAME"
    EXEC_CMD+=" --region=$REGION"
    EXEC_CMD+=" --project=$PROJECT_ID"

    # Add environment variable overrides
    EXEC_CMD+=" --update-env-vars=ACTION=$ACTION"
    EXEC_CMD+=" --update-env-vars=DRY_RUN=$DRY_RUN"
    EXEC_CMD+=" --update-env-vars=FORCE_PASSWORD_RESET=$FORCE_PASSWORD_RESET"

    if [[ "$WAIT_FOR_COMPLETION" == "true" ]]; then
        EXEC_CMD+=" --wait"
    fi

    log_info "Executing: $EXEC_CMD"
    eval "$EXEC_CMD"

    if [[ "$WAIT_FOR_COMPLETION" == "true" ]]; then
        log_info "Job completed. Checking logs..."
        # Get the latest execution
        EXECUTION=$(gcloud run jobs executions list --job="$JOB_NAME" --region="$REGION" --project="$PROJECT_ID" --limit=1 --format="value(name)" 2>/dev/null | head -1)
        if [[ -n "$EXECUTION" ]]; then
            log_info "Execution: $EXECUTION"
            gcloud run jobs executions describe "$EXECUTION" --region="$REGION" --project="$PROJECT_ID" --format="yaml(status)"
        fi
    fi
}

# Main logic
if [[ "$BUILD_ONLY" == "true" ]]; then
    build_image
elif [[ "$RUN_ONLY" == "true" ]]; then
    run_job
else
    # Both build and run
    build_image
    run_job
fi

log_info "Done!"
