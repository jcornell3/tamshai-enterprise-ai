#!/usr/bin/env bash
#
# Load Sample Data into GCP Production
#
# This script loads sample data into Cloud SQL (PostgreSQL) and MongoDB Atlas
# for HR, Finance, and Sales services.
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate permissions
#   - Cloud SQL Auth Proxy OR direct SQL access configured
#   - MongoDB Atlas connection URI in Secret Manager
#
# Usage:
#   ./scripts/gcp/load-sample-data.sh [options]
#
# Options:
#   --service=<name>   Load data for specific service (hr, finance, sales, all)
#   --dry-run          Show what would be done without making changes
#   --help             Show this help message
#
# Examples:
#   ./scripts/gcp/load-sample-data.sh                    # Load all sample data
#   ./scripts/gcp/load-sample-data.sh --service=sales   # Load only Sales data
#   ./scripts/gcp/load-sample-data.sh --dry-run         # Preview actions
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

    # Check psql (only required for HR/Finance)
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "hr" ] || [ "$SERVICE" = "finance" ]; then
        if ! command -v psql &> /dev/null; then
            log_error "psql not found. Install PostgreSQL client."
            exit 1
        fi
        log_info "psql: OK"
    fi

    # Check mongosh (required for Sales/Support)
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "sales" ] || [ "$SERVICE" = "support" ]; then
        if ! command -v mongosh &> /dev/null; then
            log_error "mongosh not found. Install from: https://www.mongodb.com/try/download/shell"
            exit 1
        fi
        log_info "mongosh: OK"
        MONGOSH_AVAILABLE=true
    fi

    # Check sample data files exist (only for requested services)
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "hr" ]; then
        if [ ! -f "$PROJECT_ROOT/sample-data/hr-data.sql" ]; then
            log_error "sample-data/hr-data.sql not found"
            exit 1
        fi
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "finance" ]; then
        if [ ! -f "$PROJECT_ROOT/sample-data/finance-data.sql" ]; then
            log_error "sample-data/finance-data.sql not found"
            exit 1
        fi
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "sales" ]; then
        if [ ! -f "$PROJECT_ROOT/sample-data/sales-data.js" ]; then
            log_error "sample-data/sales-data.js not found"
            exit 1
        fi
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "support" ]; then
        if [ ! -f "$PROJECT_ROOT/sample-data/support-data.js" ]; then
            log_error "sample-data/support-data.js not found"
            exit 1
        fi
    fi
    log_info "Sample data files: OK"
}

get_postgres_password() {
    log_info "Fetching PostgreSQL password from Secret Manager..."
    POSTGRES_PASSWORD=$(gcloud secrets versions access latest \
        --secret="tamshai-prod-db-password" \
        --project="$GCP_PROJECT" 2>/dev/null) || {
        log_error "Failed to fetch PostgreSQL password from Secret Manager"
        log_error "Ensure secret 'tamshai-prod-db-password' exists and you have access"
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
        log_error "Ensure secret 'tamshai-prod-mongodb-uri' exists and you have access"
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

# =============================================================================
# DATA LOADING FUNCTIONS
# =============================================================================

load_hr_data() {
    log_header "Loading HR Data (PostgreSQL)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would load sample-data/hr-data.sql into tamshai_hr database"
        return 0
    fi

    log_info "Loading HR sample data..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_hr \
        -f "$PROJECT_ROOT/sample-data/hr-data.sql" \
        -q

    # Verify data loaded
    log_info "Verifying HR data..."
    EMPLOYEE_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_hr \
        -t -c "SELECT COUNT(*) FROM hr.employees;" 2>/dev/null | tr -d ' ')

    log_info "HR data loaded: $EMPLOYEE_COUNT employees"
}

load_finance_data() {
    log_header "Loading Finance Data (PostgreSQL)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would load sample-data/finance-data.sql into tamshai_finance database"
        return 0
    fi

    log_info "Loading Finance sample data..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_finance \
        -f "$PROJECT_ROOT/sample-data/finance-data.sql" \
        -q

    # Verify data loaded
    log_info "Verifying Finance data..."
    BUDGET_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_finance \
        -t -c "SELECT COUNT(*) FROM finance.department_budgets;" 2>/dev/null | tr -d ' ')

    INVOICE_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h localhost \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d tamshai_finance \
        -t -c "SELECT COUNT(*) FROM finance.invoices;" 2>/dev/null | tr -d ' ')

    log_info "Finance data loaded: $BUDGET_COUNT budgets, $INVOICE_COUNT invoices"
}

load_sales_data() {
    log_header "Loading Sales Data (MongoDB Atlas)"

    if [ "$MONGOSH_AVAILABLE" != true ]; then
        log_warn "Skipping Sales data - mongosh not available"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would load sample-data/sales-data.js into MongoDB Atlas"
        return 0
    fi

    log_info "Loading Sales sample data into MongoDB Atlas..."
    mongosh "$MONGODB_URI" --quiet --file "$PROJECT_ROOT/sample-data/sales-data.js"

    # Verify data loaded
    log_info "Verifying Sales data..."
    CUSTOMER_COUNT=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_sales').customers.countDocuments()")
    DEAL_COUNT=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_sales').deals.countDocuments()")

    log_info "Sales data loaded: $CUSTOMER_COUNT customers, $DEAL_COUNT deals"
}

load_support_data() {
    log_header "Loading Support Data (MongoDB Atlas)"

    if [ "$MONGOSH_AVAILABLE" != true ]; then
        log_warn "Skipping Support data - mongosh not available"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would load sample-data/support-data.js into MongoDB Atlas"
        return 0
    fi

    log_info "Loading Support sample data into MongoDB Atlas..."
    mongosh "$MONGODB_URI" --quiet --file "$PROJECT_ROOT/sample-data/support-data.js"

    # Verify data loaded
    log_info "Verifying Support data..."
    TICKET_COUNT=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_support').tickets.countDocuments()")

    log_info "Support data loaded: $TICKET_COUNT tickets"
    log_warn "Note: Knowledge Base articles require Elasticsearch (not deployed in GCP Phase 1)"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
SERVICE="all"
DRY_RUN=false
PROXY_STARTED=false

for arg in "$@"; do
    case $arg in
        --service=*) SERVICE="${arg#*=}" ;;
        --dry-run) DRY_RUN=true ;;
        --help|-h) show_help ;;
    esac
done

echo "=================================================="
echo "GCP Sample Data Loader"
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

# Load data based on service selection
case $SERVICE in
    all)
        load_hr_data
        load_finance_data
        load_sales_data
        load_support_data
        ;;
    hr)
        load_hr_data
        ;;
    finance)
        load_finance_data
        ;;
    sales)
        load_sales_data
        ;;
    support)
        load_support_data
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
    log_info "Sample data loading complete!"
fi
echo "=================================================="
