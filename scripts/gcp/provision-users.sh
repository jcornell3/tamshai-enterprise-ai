#!/bin/bash
# =============================================================================
# Provision Production Users via Cloud Build
# =============================================================================
#
# Triggers Cloud Build to load HR sample data and sync users to Keycloak.
# Uses Cloud Build because it runs within GCP's network and can connect
# to private IP Cloud SQL instances.
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate permissions
#   - Cloud Build API enabled
#   - Required secrets in Secret Manager (see README.md)
#
# Usage:
#   ./provision-users.sh verify-only          # Check current state
#   ./provision-users.sh load-hr-data         # Load HR sample data
#   ./provision-users.sh sync-users           # Sync users to Keycloak
#   ./provision-users.sh all                  # Load data + sync users
#   ./provision-users.sh all --dry-run        # Preview without changes
#   ./provision-users.sh sync-users --force-password-reset  # Reset passwords
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (required - no defaults)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="scripts/gcp/cloudbuild-provision-users.yaml"
PROJECT_ID="${GCP_PROJECT:?GCP_PROJECT environment variable is required}"

# Default values
ACTION="${1:-verify-only}"
DRY_RUN="false"
FORCE_PASSWORD_RESET="false"

# Parse arguments
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --force-password-reset)
            FORCE_PASSWORD_RESET="true"
            shift
            ;;
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Validate action
case "$ACTION" in
    verify-only|load-hr-data|sync-users|all)
        ;;
    *)
        echo -e "${RED}Invalid action: $ACTION${NC}"
        echo ""
        echo "Valid actions:"
        echo "  verify-only     - Check current state (default)"
        echo "  load-hr-data    - Load HR sample data to Cloud SQL"
        echo "  sync-users      - Sync users to Keycloak"
        echo "  all             - Load data + sync users"
        exit 1
        ;;
esac

echo -e "${GREEN}=============================================="
echo "Provision Production Users"
echo "==============================================${NC}"
echo "Action:              $ACTION"
echo "Dry Run:             $DRY_RUN"
echo "Force Password Reset: $FORCE_PASSWORD_RESET"
echo "Project:             $PROJECT_ID"
echo ""

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1 > /dev/null; then
    echo -e "${RED}[ERROR] Not authenticated to GCP. Run: gcloud auth login${NC}"
    exit 1
fi

# Check if Cloud Build API is enabled
if ! gcloud services list --enabled --filter="name:cloudbuild.googleapis.com" --format="value(name)" 2>/dev/null | grep -q "cloudbuild"; then
    echo -e "${YELLOW}[WARN] Cloud Build API may not be enabled. Run:${NC}"
    echo "  gcloud services enable cloudbuild.googleapis.com"
fi

# Build substitutions
SUBSTITUTIONS="_ACTION=${ACTION}"
SUBSTITUTIONS="${SUBSTITUTIONS},_DRY_RUN=${DRY_RUN}"
SUBSTITUTIONS="${SUBSTITUTIONS},_FORCE_PASSWORD_RESET=${FORCE_PASSWORD_RESET}"

echo -e "${GREEN}[INFO] Triggering Cloud Build...${NC}"
echo ""

# Change to repo root for Cloud Build context
cd "$REPO_ROOT"

# Submit Cloud Build
gcloud builds submit \
    --config="$CONFIG_FILE" \
    --substitutions="$SUBSTITUTIONS" \
    --project="$PROJECT_ID" \
    .

echo ""
echo -e "${GREEN}=============================================="
echo "Cloud Build completed"
echo "==============================================${NC}"
