#!/bin/bash
# =============================================================================
# GCP Dynamic URL Discovery Library
# =============================================================================
#
# Functions for dynamically discovering Cloud Run URLs and Cloud SQL IPs.
# Eliminates hardcoded values in deploy-to-gcp.yml (fixes Phoenix rebuild issues).
#
# Usage:
#   source /path/to/scripts/gcp/lib/dynamic-urls.sh
#   KEYCLOAK_URL=$(discover_keycloak_url)
#   POSTGRES_IP=$(discover_cloudsql_ip)
#
# Requirements:
#   - gcloud CLI authenticated
#   - GCP_REGION environment variable (required)
#
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_urls_info() { echo -e "${BLUE}[urls]${NC} $1"; }
log_urls_success() { echo -e "${GREEN}[urls]${NC} $1"; }
log_urls_warn() { echo -e "${YELLOW}[urls]${NC} $1"; }
log_urls_error() { echo -e "${RED}[urls]${NC} $1"; }

# Default values
GCP_REGION="${GCP_REGION}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-tamshai-prod-postgres}"

# Discover Cloud Run service URL
# Usage: discover_service_url "service-name"
discover_service_url() {
    local service_name="$1"
    local region="${GCP_REGION}"

    local url
    url=$(gcloud run services describe "$service_name" \
        --region="$region" \
        --format="value(status.url)" 2>/dev/null) || url=""

    if [ -n "$url" ]; then
        echo "$url"
        return 0
    fi

    log_urls_error "Could not discover URL for service: $service_name" >&2
    return 1
}

# Discover Keycloak URL
discover_keycloak_url() {
    local url
    url=$(discover_service_url "keycloak") || {
        log_urls_warn "Falling back to auth.tamshai.com" >&2
        echo "https://auth.tamshai.com"
        return 0
    }
    echo "$url"
}

# Discover Keycloak issuer URL (for JWT validation)
discover_keycloak_issuer() {
    local base_url
    base_url=$(discover_keycloak_url)
    echo "${base_url}/auth/realms/tamshai-corp"
}

# Discover Keycloak JWKS URI
discover_jwks_uri() {
    local issuer
    issuer=$(discover_keycloak_issuer)
    echo "${issuer}/protocol/openid-connect/certs"
}

# Discover MCP Gateway URL
discover_mcp_gateway_url() {
    discover_service_url "mcp-gateway"
}

# Discover MCP HR URL
discover_mcp_hr_url() {
    discover_service_url "mcp-hr"
}

# Discover MCP Finance URL
discover_mcp_finance_url() {
    discover_service_url "mcp-finance"
}

# Discover MCP Sales URL
discover_mcp_sales_url() {
    discover_service_url "mcp-sales"
}

# Discover MCP Support URL
discover_mcp_support_url() {
    discover_service_url "mcp-support"
}

# Discover Web Portal URL
discover_web_portal_url() {
    discover_service_url "web-portal"
}

# Discover Cloud SQL private IP
discover_cloudsql_ip() {
    local instance_name="${1:-$CLOUD_SQL_INSTANCE}"
    local region="${GCP_REGION}"

    local ip
    ip=$(gcloud sql instances describe "$instance_name" \
        --format="value(ipAddresses[0].ipAddress)" 2>/dev/null) || ip=""

    if [ -n "$ip" ]; then
        echo "$ip"
        return 0
    fi

    log_urls_error "Could not discover IP for Cloud SQL instance: $instance_name" >&2
    return 1
}

# Discover Cloud SQL connection name
discover_cloudsql_connection_name() {
    local instance_name="${1:-$CLOUD_SQL_INSTANCE}"

    local connection_name
    connection_name=$(gcloud sql instances describe "$instance_name" \
        --format="value(connectionName)" 2>/dev/null) || connection_name=""

    if [ -n "$connection_name" ]; then
        echo "$connection_name"
        return 0
    fi

    log_urls_error "Could not discover connection name for Cloud SQL: $instance_name" >&2
    return 1
}

# Discover VPC connector self-link
discover_vpc_connector() {
    local connector_name="${1:-tamshai-prod-connector}"
    local region="${GCP_REGION}"

    local self_link
    self_link=$(gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="$region" \
        --format="value(name)" 2>/dev/null) || self_link=""

    if [ -n "$self_link" ]; then
        echo "$self_link"
        return 0
    fi

    log_urls_error "Could not discover VPC connector: $connector_name" >&2
    return 1
}

# Discover Artifact Registry repo URL
discover_artifact_registry_url() {
    local project_id="${GCP_PROJECT_ID:-}"
    local region="${GCP_REGION}"
    local repo_name="${1:-tamshai}"

    if [ -z "$project_id" ]; then
        log_urls_error "GCP_PROJECT_ID not set" >&2
        return 1
    fi

    echo "${region}-docker.pkg.dev/${project_id}/${repo_name}"
}

# Discover all URLs and export as environment variables
# Usage: eval "$(discover_all_urls)"
discover_all_urls() {
    log_urls_info "Discovering all GCP URLs..." >&2

    # Cloud Run services
    local keycloak_url mcp_gateway_url mcp_hr_url mcp_finance_url mcp_sales_url mcp_support_url web_portal_url
    keycloak_url=$(discover_keycloak_url 2>/dev/null) || keycloak_url=""
    mcp_gateway_url=$(discover_mcp_gateway_url 2>/dev/null) || mcp_gateway_url=""
    mcp_hr_url=$(discover_mcp_hr_url 2>/dev/null) || mcp_hr_url=""
    mcp_finance_url=$(discover_mcp_finance_url 2>/dev/null) || mcp_finance_url=""
    mcp_sales_url=$(discover_mcp_sales_url 2>/dev/null) || mcp_sales_url=""
    mcp_support_url=$(discover_mcp_support_url 2>/dev/null) || mcp_support_url=""
    web_portal_url=$(discover_web_portal_url 2>/dev/null) || web_portal_url=""

    # Cloud SQL
    local postgres_ip cloudsql_connection
    postgres_ip=$(discover_cloudsql_ip 2>/dev/null) || postgres_ip=""
    cloudsql_connection=$(discover_cloudsql_connection_name 2>/dev/null) || cloudsql_connection=""

    # Keycloak-derived URLs
    local keycloak_issuer jwks_uri
    keycloak_issuer="${keycloak_url}/auth/realms/tamshai-corp"
    jwks_uri="${keycloak_issuer}/protocol/openid-connect/certs"

    # Output as shell exports
    cat << EOF
export KEYCLOAK_URL="${keycloak_url}"
export KEYCLOAK_ISSUER="${keycloak_issuer}"
export JWKS_URI="${jwks_uri}"
export MCP_GATEWAY_URL="${mcp_gateway_url}"
export MCP_HR_URL="${mcp_hr_url}"
export MCP_FINANCE_URL="${mcp_finance_url}"
export MCP_SALES_URL="${mcp_sales_url}"
export MCP_SUPPORT_URL="${mcp_support_url}"
export WEB_PORTAL_URL="${web_portal_url}"
export POSTGRES_IP="${postgres_ip}"
export CLOUDSQL_CONNECTION="${cloudsql_connection}"
EOF

    log_urls_success "URL discovery complete" >&2
}

# Print discovered URLs in a table format
print_discovered_urls() {
    log_urls_info "Discovered GCP URLs"
    echo ""
    printf "%-25s %s\n" "RESOURCE" "URL/VALUE"
    printf "%s\n" "$(printf '%.0s-' {1..80})"

    # Cloud Run services
    for service in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
        local url
        url=$(discover_service_url "$service" 2>/dev/null) || url="NOT FOUND"
        printf "%-25s %s\n" "$service" "$url"
    done

    echo ""

    # Cloud SQL
    local postgres_ip cloudsql_connection
    postgres_ip=$(discover_cloudsql_ip 2>/dev/null) || postgres_ip="NOT FOUND"
    cloudsql_connection=$(discover_cloudsql_connection_name 2>/dev/null) || cloudsql_connection="NOT FOUND"

    printf "%-25s %s\n" "Cloud SQL IP" "$postgres_ip"
    printf "%-25s %s\n" "Cloud SQL Connection" "$cloudsql_connection"

    echo ""
}

# Generate GitHub Actions outputs format
# Usage: discover_urls_for_github_actions >> $GITHUB_OUTPUT
discover_urls_for_github_actions() {
    local keycloak_url mcp_gateway_url mcp_hr_url mcp_finance_url mcp_sales_url mcp_support_url web_portal_url
    local postgres_ip cloudsql_connection

    keycloak_url=$(discover_keycloak_url 2>/dev/null) || keycloak_url=""
    mcp_gateway_url=$(discover_mcp_gateway_url 2>/dev/null) || mcp_gateway_url=""
    mcp_hr_url=$(discover_mcp_hr_url 2>/dev/null) || mcp_hr_url=""
    mcp_finance_url=$(discover_mcp_finance_url 2>/dev/null) || mcp_finance_url=""
    mcp_sales_url=$(discover_mcp_sales_url 2>/dev/null) || mcp_sales_url=""
    mcp_support_url=$(discover_mcp_support_url 2>/dev/null) || mcp_support_url=""
    web_portal_url=$(discover_web_portal_url 2>/dev/null) || web_portal_url=""
    postgres_ip=$(discover_cloudsql_ip 2>/dev/null) || postgres_ip=""
    cloudsql_connection=$(discover_cloudsql_connection_name 2>/dev/null) || cloudsql_connection=""

    echo "keycloak_url=${keycloak_url}"
    echo "keycloak_issuer=${keycloak_url}/auth/realms/tamshai-corp"
    echo "jwks_uri=${keycloak_url}/auth/realms/tamshai-corp/protocol/openid-connect/certs"
    echo "mcp_gateway_url=${mcp_gateway_url}"
    echo "mcp_hr_url=${mcp_hr_url}"
    echo "mcp_finance_url=${mcp_finance_url}"
    echo "mcp_sales_url=${mcp_sales_url}"
    echo "mcp_support_url=${mcp_support_url}"
    echo "web_portal_url=${web_portal_url}"
    echo "postgres_ip=${postgres_ip}"
    echo "cloudsql_connection=${cloudsql_connection}"
}

echo "[dynamic-urls] Library loaded"
