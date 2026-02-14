#!/bin/bash
# =============================================================================
# Generative UI Verification Test Runner
# =============================================================================
#
# Runs comprehensive verification of all Gen UI display directives after
# Phoenix rebuild or major infrastructure changes.
#
# Usage:
#   ./verify-genui.sh                    # Run all tests
#   ./verify-genui.sh --coverage         # Run with coverage
#   ./verify-genui.sh --verbose          # Run with verbose output
#   ./verify-genui.sh --watch            # Run in watch mode
#
# Prerequisites:
#   - Docker containers running (all services healthy)
#   - MCP_INTEGRATION_RUNNER_SECRET environment variable set
#   - MCP UI service running on port $PORT_MCP_UI
#   - MCP Gateway running on port $PORT_MCP_GATEWAY
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Check prerequisites
check_prerequisites() {
  log_header "Checking Prerequisites"

  # Check if Docker containers are running
  if ! docker ps --filter "name=tamshai-dev-mcp-ui" --format "{{.Names}}" | grep -q "tamshai-dev-mcp-ui"; then
    log_error "MCP UI container not running. Start services first:"
    echo "  cd infrastructure/docker && docker compose up -d"
    exit 1
  fi

  if ! docker ps --filter "name=tamshai-dev-mcp-gateway" --format "{{.Names}}" | grep -q "tamshai-dev-mcp-gateway"; then
    log_error "MCP Gateway container not running"
    exit 1
  fi

  log_info "Docker containers running ✓"

  # Check if MCP_INTEGRATION_RUNNER_SECRET is set
  if [ -z "${MCP_INTEGRATION_RUNNER_SECRET:-}" ]; then
    log_warn "MCP_INTEGRATION_RUNNER_SECRET not set. Attempting to retrieve from Keycloak..."

    # Try to get the secret from Keycloak
    if command -v docker &> /dev/null; then
      SECRET=$(MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
        /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080/auth --realm master --user admin --password admin 2>&1 > /dev/null && \
        MSYS_NO_PATHCONV=1 docker exec tamshai-dev-keycloak \
        /opt/keycloak/bin/kcadm.sh get clients -r tamshai-corp \
        --fields secret -q clientId=mcp-integration-runner 2>/dev/null | grep -oP '"secret"\s*:\s*"\K[^"]+' || echo "")

      if [ -n "$SECRET" ]; then
        export MCP_INTEGRATION_RUNNER_SECRET="$SECRET"
        log_info "Retrieved MCP_INTEGRATION_RUNNER_SECRET from Keycloak ✓"
      else
        log_error "Could not retrieve secret from Keycloak"
        echo "Please set MCP_INTEGRATION_RUNNER_SECRET manually:"
        echo "  export MCP_INTEGRATION_RUNNER_SECRET=<secret>"
        exit 1
      fi
    else
      log_error "Docker not available to retrieve secret"
      exit 1
    fi
  else
    log_info "MCP_INTEGRATION_RUNNER_SECRET is set ✓"
  fi

  # Check if services are healthy
  log_info "Checking service health..."

  if ! curl -s http://localhost:${PORT_MCP_UI:?PORT_MCP_UI required}/health &> /dev/null; then
    log_error "MCP UI service not responding on port ${PORT_MCP_UI}"
    exit 1
  fi

  if ! curl -s http://localhost:${PORT_MCP_GATEWAY:?PORT_MCP_GATEWAY required}/health &> /dev/null; then
    log_error "MCP Gateway not responding on port ${PORT_MCP_GATEWAY}"
    exit 1
  fi

  log_info "All services healthy ✓"
}

# Install dependencies if needed
install_deps() {
  if [ ! -d "node_modules" ]; then
    log_header "Installing Dependencies"
    npm install
  fi
}

# Parse command line arguments
MODE="${1:-}"

# Run checks
check_prerequisites
install_deps

# Run tests based on mode
log_header "Running Generative UI Verification Tests"

case "$MODE" in
  --coverage)
    log_info "Running with coverage..."
    npm run test:coverage -- generative-ui-verification.test.ts
    ;;
  --verbose)
    log_info "Running with verbose output..."
    npm run test:verbose -- generative-ui-verification.test.ts
    ;;
  --watch)
    log_info "Running in watch mode..."
    npm run test:watch -- generative-ui-verification.test.ts
    ;;
  *)
    log_info "Running all verification tests..."
    npm run test:genui
    ;;
esac

log_header "Test Results"
log_info "Verification complete!"
echo ""
echo "Tests covered:"
echo "  ✓ Approvals Queue (multi-domain name resolution)"
echo "  ✓ Approval Actions (database persistence)"
echo "  ✓ HR Display Directives"
echo "  ✓ Finance Display Directives"
echo "  ✓ Sales Display Directives"
echo "  ✓ Support Display Directives"
echo "  ✓ Payroll Display Directives"
echo "  ✓ Tax Display Directives"
echo "  ✓ Error Handling & Edge Cases"
echo ""
