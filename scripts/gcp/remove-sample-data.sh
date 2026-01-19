#!/usr/bin/env bash
#
# Remove Sample Data from GCP Production
#
# This script removes sample data from Cloud SQL (PostgreSQL) and MongoDB Atlas
# for HR, Finance, and Sales services.
#
# WARNING: This is a DESTRUCTIVE operation. Data will be permanently deleted.
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate permissions
#   - Cloud SQL Auth Proxy OR direct SQL access configured
#   - MongoDB Atlas connection URI in Secret Manager
#
# Usage:
#   ./scripts/gcp/remove-sample-data.sh [options]
#
# Options:
#   --service=<name>   Remove data for specific service (hr, finance, sales, all)
#   --dry-run          Show what would be done without making changes
#   --force            Skip confirmation prompt
#   --help             Show this help message
#
# Examples:
#   ./scripts/gcp/remove-sample-data.sh                    # Remove all sample data
#   ./scripts/gcp/remove-sample-data.sh --service=sales   # Remove only Sales data
#   ./scripts/gcp/remove-sample-data.sh --dry-run         # Preview actions
#

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# GCP Configuration (required - no defaults)
GCP_PROJECT="${GCP_PROJECT:?GCP_PROJECT environment variable is required}"
GCP_REGION="${GCP_REGION:?GCP_REGION environment variable is required}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-tamshai-prod-postgres}"

# Database Configuration
POSTGRES_USER="${POSTGRES_USER:-tamshai}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

show_help() {
    head -35 "$0" | tail -30
    exit 0
}

check_prerequisites() {
    log_header "Checking Prerequisites"

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    log_info "gcloud CLI: OK"

    # Check psql
    if ! command -v psql &> /dev/null; then
        log_error "psql not found. Install PostgreSQL client."
        exit 1
    fi
    log_info "psql: OK"

    # Check mongosh
    if ! command -v mongosh &> /dev/null; then
        log_warn "mongosh not found. Sales data removal will be skipped."
        MONGOSH_AVAILABLE=false
    else
        log_info "mongosh: OK"
        MONGOSH_AVAILABLE=true
    fi
}

get_postgres_password() {
    log_info "Fetching PostgreSQL password from Secret Manager..."
    POSTGRES_PASSWORD=$(gcloud secrets versions access latest \
        --secret="tamshai-prod-db-password" \
        --project="$GCP_PROJECT" 2>/dev/null) || {
        log_error "Failed to fetch PostgreSQL password from Secret Manager"
        exit 1
    }
    log_info "PostgreSQL password: Retrieved"
}

get_mongodb_uri() {
    log_info "Fetching MongoDB URI from Secret Manager..."
    MONGODB_URI=$(gcloud secrets versions access latest \
        --secret="tamshai-prod-mongodb-uri" \
        --project="$GCP_PROJECT" 2>/dev/null) || {
        log_error "Failed to fetch MongoDB URI from Secret Manager"
        exit 1
    }
    log_info "MongoDB URI: Retrieved"
}

start_cloud_sql_proxy() {
    log_info "Starting Cloud SQL Auth Proxy..."

    # Check if proxy is already running
    if pgrep -f "cloud-sql-proxy" > /dev/null; then
        log_info "Cloud SQL Auth Proxy already running"
        PROXY_PID=$(pgrep -f "cloud-sql-proxy" | head -1)
        return 0
    fi

    # Start proxy in background
    cloud-sql-proxy "$GCP_PROJECT:$GCP_REGION:$CLOUD_SQL_INSTANCE" \
        --port=$POSTGRES_PORT &
    PROXY_PID=$!

    # Wait for proxy to be ready
    sleep 3

    if ! kill -0 $PROXY_PID 2>/dev/null; then
        log_error "Cloud SQL Auth Proxy failed to start"
        exit 1
    fi

    log_info "Cloud SQL Auth Proxy started (PID: $PROXY_PID)"
    PROXY_STARTED=true
}

stop_cloud_sql_proxy() {
    if [ "$PROXY_STARTED" = true ] && [ -n "$PROXY_PID" ]; then
        log_info "Stopping Cloud SQL Auth Proxy..."
        kill $PROXY_PID 2>/dev/null || true
    fi
}

confirm_action() {
    if [ "$FORCE" = true ]; then
        return 0
    fi

    echo ""
    echo -e "${RED}WARNING: This will permanently delete sample data from GCP production!${NC}"
    echo ""
    echo "Services affected: $SERVICE"
    echo ""
    read -p "Type 'DELETE' to confirm: " confirmation

    if [ "$confirmation" != "DELETE" ]; then
        log_error "Confirmation failed. Aborting."
        exit 1
    fi
}

# =============================================================================
# DATA REMOVAL FUNCTIONS
# =============================================================================

remove_hr_data() {
    log_header "Removing HR Data (PostgreSQL)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would truncate all tables in tamshai_hr database"
        return 0
    fi

    log_info "Removing HR sample data..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_hr \
        -c "TRUNCATE TABLE hr.employees CASCADE;" \
        -q 2>/dev/null || log_warn "HR tables may not exist or already empty"

    log_info "HR data removed"
}

remove_finance_data() {
    log_header "Removing Finance Data (PostgreSQL)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would truncate all tables in tamshai_finance database"
        return 0
    fi

    log_info "Removing Finance sample data..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_finance \
        -c "
            TRUNCATE TABLE finance.expense_reports CASCADE;
            TRUNCATE TABLE finance.invoices CASCADE;
            TRUNCATE TABLE finance.department_budgets CASCADE;
            TRUNCATE TABLE finance.revenue_summary CASCADE;
        " \
        -q 2>/dev/null || log_warn "Finance tables may not exist or already empty"

    log_info "Finance data removed"
}

remove_sales_data() {
    log_header "Removing Sales Data (MongoDB Atlas)"

    if [ "$MONGOSH_AVAILABLE" != true ]; then
        log_warn "Skipping Sales data - mongosh not available"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would drop all collections in tamshai_sales database"
        return 0
    fi

    log_info "Removing Sales sample data from MongoDB Atlas..."
    mongosh "$MONGODB_URI" --quiet --eval "
        db = db.getSiblingDB('tamshai_sales');
        db.customers.drop();
        db.deals.drop();
        db.pipeline_summary.drop();
        db.activities.drop();
        print('Sales collections dropped');
    "

    log_info "Sales data removed"
}

remove_support_data() {
    log_header "Removing Support Data (MongoDB Atlas)"

    if [ "$MONGOSH_AVAILABLE" != true ]; then
        log_warn "Skipping Support data - mongosh not available"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would drop all collections in tamshai_support database"
        return 0
    fi

    log_info "Removing Support sample data from MongoDB Atlas..."
    mongosh "$MONGODB_URI" --quiet --eval "
        db = db.getSiblingDB('tamshai_support');
        db.tickets.drop();
        db.ticket_summary.drop();
        print('Support collections dropped');
    "

    log_info "Support data removed"
    log_warn "Note: Knowledge Base articles in Elasticsearch not affected (not deployed in GCP Phase 1)"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
SERVICE="all"
DRY_RUN=false
FORCE=false
PROXY_STARTED=false

for arg in "$@"; do
    case $arg in
        --service=*) SERVICE="${arg#*=}" ;;
        --dry-run) DRY_RUN=true ;;
        --force) FORCE=true ;;
        --help|-h) show_help ;;
    esac
done

echo "=================================================="
echo "GCP Sample Data Remover"
echo "=================================================="
echo "Project: $GCP_PROJECT"
echo "Region: $GCP_REGION"
echo "Service: $SERVICE"
echo "Dry Run: $DRY_RUN"
echo ""

# Trap to ensure cleanup on exit
trap stop_cloud_sql_proxy EXIT

# Run checks
check_prerequisites

# Confirm destructive action (unless dry run)
if [ "$DRY_RUN" != true ]; then
    confirm_action
fi

# Get credentials (unless dry run)
if [ "$DRY_RUN" != true ]; then
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "hr" ] || [ "$SERVICE" = "finance" ]; then
        get_postgres_password
        start_cloud_sql_proxy
    fi

    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "sales" ] || [ "$SERVICE" = "support" ]; then
        if [ "$MONGOSH_AVAILABLE" = true ]; then
            get_mongodb_uri
        fi
    fi
fi

# Remove data based on service selection
case $SERVICE in
    all)
        remove_hr_data
        remove_finance_data
        remove_sales_data
        remove_support_data
        ;;
    hr)
        remove_hr_data
        ;;
    finance)
        remove_finance_data
        ;;
    sales)
        remove_sales_data
        ;;
    support)
        remove_support_data
        ;;
    *)
        log_error "Unknown service: $SERVICE"
        log_error "Valid options: all, hr, finance, sales, support"
        exit 1
        ;;
esac

echo ""
echo "=================================================="
if [ "$DRY_RUN" = true ]; then
    log_info "Dry run complete - no changes made"
else
    log_info "Sample data removal complete!"
fi
echo "=================================================="
