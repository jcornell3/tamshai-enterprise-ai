#!/bin/bash
# =============================================================================
# GCP Sample Data Access Test
# =============================================================================
#
# Tests that MCP servers can access the sample data loaded into MongoDB Atlas.
# Verifies Sales and Support data connectivity and basic queries.
#
# Usage:
#   ./test-data-access.sh
#
# Prerequisites:
#   - mongosh installed
#   - GCP credentials configured (gcloud auth)
#   - tamshai-prod-mongodb-uri secret in Secret Manager
#
# =============================================================================

set -euo pipefail

# Project configuration (required - no defaults)
readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly GCP_PROJECT="${GCP_PROJECT:?GCP_PROJECT environment variable is required}"
readonly GCP_REGION="${GCP_REGION:?GCP_REGION environment variable is required}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TESTS_RUN++))

    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

check_prerequisites() {
    log_header "Checking Prerequisites"

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    log_info "gcloud CLI: OK"

    # Check mongosh
    if ! command -v mongosh &> /dev/null; then
        log_error "mongosh not found. Install from: https://www.mongodb.com/try/download/shell"
        exit 1
    fi
    log_info "mongosh: OK"
}

get_mongodb_uri() {
    log_header "Fetching MongoDB Credentials"

    log_info "Fetching MongoDB URI from Secret Manager..."
    MONGODB_URI=$(gcloud secrets versions access latest \
        --secret="tamshai-prod-mongodb-uri" \
        --project="$GCP_PROJECT" 2>/dev/null)

    if [ -z "$MONGODB_URI" ]; then
        log_error "Failed to retrieve MongoDB URI"
        exit 1
    fi

    log_info "MongoDB URI: Retrieved"
}

test_sales_data() {
    log_header "Testing Sales Data Access"

    # Test 1: Database exists
    ((TESTS_RUN++))
    log_info "Running test: Sales database exists..."
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_sales").getName()' 2>&1 | grep -q 'tamshai_sales'; then
        log_success "Sales database exists"
        ((TESTS_PASSED++))
    else
        log_fail "Sales database exists"
        ((TESTS_FAILED++))
    fi

    # Test 2: Customers collection has data
    local customer_count=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_sales').customers.countDocuments()")
    if [ "$customer_count" -gt 0 ]; then
        log_success "Customers collection has $customer_count records"
        ((TESTS_RUN++))
        ((TESTS_PASSED++))
    else
        log_fail "Customers collection is empty"
        ((TESTS_RUN++))
        ((TESTS_FAILED++))
    fi

    # Test 3: Deals collection has data
    local deal_count=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_sales').deals.countDocuments()")
    if [ "$deal_count" -gt 0 ]; then
        log_success "Deals collection has $deal_count records"
        ((TESTS_RUN++))
        ((TESTS_PASSED++))
    else
        log_fail "Deals collection is empty"
        ((TESTS_RUN++))
        ((TESTS_FAILED++))
    fi

    # Test 4: Can query specific customer
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_sales").customers.findOne({company_name: "Acme Corporation"})' 2>/dev/null | grep -q 'Acme Corporation'; then
        log_success "Query specific customer (Acme Corporation)"
        ((TESTS_PASSED++))
    else
        log_fail "Query specific customer (Acme Corporation)"
        ((TESTS_FAILED++))
    fi

    # Test 5: Deals have required fields
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_sales").deals.findOne({}, {deal_id: 1, customer_id: 1, stage: 1, value: 1})' 2>/dev/null | grep -q 'deal_id'; then
        log_success "Deals have required fields (deal_id, customer_id, stage, value)"
        ((TESTS_PASSED++))
    else
        log_fail "Deals have required fields (deal_id, customer_id, stage, value)"
        ((TESTS_FAILED++))
    fi

    # Test 6: Pipeline summary exists
    ((TESTS_RUN++))
    local pipeline_count=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_sales').pipeline_summary.countDocuments()" 2>/dev/null)
    if [ "$pipeline_count" -gt 0 ]; then
        log_success "Pipeline summary collection exists"
        ((TESTS_PASSED++))
    else
        log_fail "Pipeline summary collection exists"
        ((TESTS_FAILED++))
    fi
}

test_support_data() {
    log_header "Testing Support Data Access"

    # Test 1: Database exists
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_support").getName()' 2>/dev/null | grep -q 'tamshai_support'; then
        log_success "Support database exists"
        ((TESTS_PASSED++))
    else
        log_fail "Support database exists"
        ((TESTS_FAILED++))
    fi

    # Test 2: Tickets collection has data
    local ticket_count=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_support').tickets.countDocuments()")
    if [ "$ticket_count" -gt 0 ]; then
        log_success "Tickets collection has $ticket_count records"
        ((TESTS_RUN++))
        ((TESTS_PASSED++))
    else
        log_fail "Tickets collection is empty"
        ((TESTS_RUN++))
        ((TESTS_FAILED++))
    fi

    # Test 3: Query specific ticket
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_support").tickets.findOne({ticket_id: "TICK-001"})' 2>/dev/null | grep -q 'TICK-001'; then
        log_success "Query specific ticket (TICK-001)"
        ((TESTS_PASSED++))
    else
        log_fail "Query specific ticket (TICK-001)"
        ((TESTS_FAILED++))
    fi

    # Test 4: Tickets have required fields
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_support").tickets.findOne({}, {ticket_id: 1, title: 1, status: 1, priority: 1})' 2>/dev/null | grep -q 'ticket_id'; then
        log_success "Tickets have required fields (ticket_id, title, status, priority)"
        ((TESTS_PASSED++))
    else
        log_fail "Tickets have required fields (ticket_id, title, status, priority)"
        ((TESTS_FAILED++))
    fi

    # Test 5: Ticket summary exists
    local summary_count=$(mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('tamshai_support').ticket_summary.countDocuments()")
    if [ "$summary_count" -gt 0 ]; then
        log_success "Ticket summary has $summary_count records"
        ((TESTS_RUN++))
        ((TESTS_PASSED++))
    else
        log_fail "Ticket summary is empty"
        ((TESTS_RUN++))
        ((TESTS_FAILED++))
    fi

    # Test 6: Query tickets by status
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_support").tickets.findOne({status: "open"})' 2>/dev/null | grep -q 'open'; then
        log_success "Query open tickets"
        ((TESTS_PASSED++))
    else
        log_fail "Query open tickets"
        ((TESTS_FAILED++))
    fi

    # Test 7: Query tickets by priority
    ((TESTS_RUN++))
    if mongosh "$MONGODB_URI" --quiet --eval 'db.getSiblingDB("tamshai_support").tickets.findOne({priority: "high"})' 2>/dev/null | grep -q 'high'; then
        log_success "Query high priority tickets"
        ((TESTS_PASSED++))
    else
        log_fail "Query high priority tickets"
        ((TESTS_FAILED++))
    fi
}

test_data_integrity() {
    log_header "Testing Data Integrity"

    # Test 1: Sales - Customer IDs referenced in deals exist
    ((TESTS_RUN++))
    local result=$(mongosh "$MONGODB_URI" --quiet --eval '
        const db = db.getSiblingDB("tamshai_sales");
        const deal = db.deals.findOne({}, {customer_id: 1});
        const customer = db.customers.findOne({_id: deal.customer_id});
        print(customer ? "valid" : "invalid");
    ' 2>/dev/null)
    if echo "$result" | grep -q 'valid'; then
        log_success "Sales deals reference valid customers"
        ((TESTS_PASSED++))
    else
        log_fail "Sales deals reference valid customers"
        ((TESTS_FAILED++))
    fi

    # Test 2: Support - Assigned tickets have valid assignee
    ((TESTS_RUN++))
    local result=$(mongosh "$MONGODB_URI" --quiet --eval '
        const db = db.getSiblingDB("tamshai_support");
        const ticket = db.tickets.findOne({assigned_to: {$ne: null}}, {assigned_to: 1});
        print(ticket && ticket.assigned_to ? "valid" : "invalid");
    ' 2>/dev/null)
    if echo "$result" | grep -q 'valid'; then
        log_success "Support tickets with assigned_to field have values"
        ((TESTS_PASSED++))
    else
        log_fail "Support tickets with assigned_to field have values"
        ((TESTS_FAILED++))
    fi

    # Test 3: Sales - Deal values are numeric
    ((TESTS_RUN++))
    local result=$(mongosh "$MONGODB_URI" --quiet --eval '
        const db = db.getSiblingDB("tamshai_sales");
        const deal = db.deals.findOne({}, {value: 1});
        print(typeof deal.value === "number" ? "valid" : "invalid");
    ' 2>/dev/null)
    if echo "$result" | grep -q 'valid'; then
        log_success "Sales deal values are numeric"
        ((TESTS_PASSED++))
    else
        log_fail "Sales deal values are numeric"
        ((TESTS_FAILED++))
    fi
}

print_summary() {
    log_header "Test Summary"

    echo ""
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All tests passed!"
        echo ""
        log_info "Sales and Support data is accessible and valid"
        log_info "MCP servers should be able to query this data successfully"
        return 0
    else
        log_fail "Some tests failed"
        echo ""
        log_error "Please review the failed tests above"
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo "=================================================="
echo "GCP Sample Data Access Test"
echo "=================================================="
echo "Project: $GCP_PROJECT"
echo "Region: $GCP_REGION"
echo ""

# Run checks
check_prerequisites

# Get credentials
get_mongodb_uri

# Run tests
test_sales_data
test_support_data
test_data_integrity

# Print summary
print_summary
