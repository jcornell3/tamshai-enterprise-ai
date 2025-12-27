#!/bin/bash
# =============================================================================
# mTLS Certificate Generation Script for Tamshai Enterprise AI
# =============================================================================
#
# This script generates a Certificate Authority (CA) and service certificates
# for mutual TLS (mTLS) authentication between internal services.
#
# Usage:
#   ./scripts/generate-mtls-certs.sh [--force]
#
# Options:
#   --force    Regenerate all certificates even if they exist
#
# Generated certificates:
#   - ca.crt / ca.key           - Certificate Authority
#   - mcp-gateway.crt/.key      - MCP Gateway service
#   - mcp-hr.crt/.key           - MCP HR service
#   - mcp-finance.crt/.key      - MCP Finance service
#   - mcp-sales.crt/.key        - MCP Sales service
#   - mcp-support.crt/.key      - MCP Support service
#   - postgres.crt/.key         - PostgreSQL database
#   - redis.crt/.key            - Redis cache
#   - mongodb.crt/.key          - MongoDB database
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_ROOT/infrastructure/docker/certs"

# Certificate validity (days)
CA_VALIDITY=3650      # 10 years for CA
CERT_VALIDITY=365     # 1 year for service certs

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if OpenSSL is available
check_prerequisites() {
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is required but not installed."
        exit 1
    fi
    log_info "OpenSSL version: $(openssl version)"
}

# Create certificates directory
setup_directory() {
    mkdir -p "$CERTS_DIR"
    chmod 700 "$CERTS_DIR"
    log_info "Certificates directory: $CERTS_DIR"
}

# Generate Certificate Authority
generate_ca() {
    if [[ -f "$CERTS_DIR/ca.crt" && -f "$CERTS_DIR/ca.key" && "$FORCE" != "true" ]]; then
        log_warn "CA already exists. Use --force to regenerate."
        return
    fi

    log_info "Generating Certificate Authority..."

    # Generate CA private key
    openssl genrsa -out "$CERTS_DIR/ca.key" 4096

    # Generate CA certificate
    openssl req -new -x509 -days $CA_VALIDITY \
        -key "$CERTS_DIR/ca.key" \
        -out "$CERTS_DIR/ca.crt" \
        -subj "/C=US/ST=California/L=San Francisco/O=Tamshai Corp/OU=Security/CN=Tamshai Internal CA"

    chmod 600 "$CERTS_DIR/ca.key"
    chmod 644 "$CERTS_DIR/ca.crt"

    log_info "CA certificate generated successfully"
}

# Generate service certificate
generate_service_cert() {
    local service_name=$1
    local dns_names=$2

    if [[ -f "$CERTS_DIR/${service_name}.crt" && -f "$CERTS_DIR/${service_name}.key" && "$FORCE" != "true" ]]; then
        log_warn "Certificate for $service_name already exists. Use --force to regenerate."
        return
    fi

    log_info "Generating certificate for $service_name..."

    # Create temporary config file for SAN
    local config_file=$(mktemp)
    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = US
ST = California
L = San Francisco
O = Tamshai Corp
OU = Engineering
CN = $service_name

[req_ext]
subjectAltName = @alt_names

[alt_names]
$dns_names
EOF

    # Generate private key
    openssl genrsa -out "$CERTS_DIR/${service_name}.key" 2048

    # Generate CSR
    openssl req -new \
        -key "$CERTS_DIR/${service_name}.key" \
        -out "$CERTS_DIR/${service_name}.csr" \
        -config "$config_file"

    # Sign with CA
    openssl x509 -req -days $CERT_VALIDITY \
        -in "$CERTS_DIR/${service_name}.csr" \
        -CA "$CERTS_DIR/ca.crt" \
        -CAkey "$CERTS_DIR/ca.key" \
        -CAcreateserial \
        -out "$CERTS_DIR/${service_name}.crt" \
        -extfile "$config_file" \
        -extensions req_ext

    # Clean up
    rm -f "$CERTS_DIR/${service_name}.csr" "$config_file"
    chmod 600 "$CERTS_DIR/${service_name}.key"
    chmod 644 "$CERTS_DIR/${service_name}.crt"

    log_info "Certificate for $service_name generated successfully"
}

# Generate combined PEM for services that need it
generate_combined_pem() {
    local service_name=$1

    cat "$CERTS_DIR/${service_name}.crt" "$CERTS_DIR/${service_name}.key" > "$CERTS_DIR/${service_name}.pem"
    chmod 600 "$CERTS_DIR/${service_name}.pem"

    log_info "Combined PEM for $service_name generated"
}

# Main execution
main() {
    FORCE="false"

    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --force)
                FORCE="true"
                log_warn "Force mode: All certificates will be regenerated"
                ;;
        esac
    done

    echo "=============================================="
    echo " Tamshai mTLS Certificate Generator"
    echo "=============================================="

    check_prerequisites
    setup_directory

    # Generate CA
    generate_ca

    # Generate service certificates with appropriate SANs
    # Format: DNS.1 = name1\nDNS.2 = name2
    generate_service_cert "mcp-gateway" "DNS.1 = mcp-gateway
DNS.2 = localhost
DNS.3 = 127.0.0.1"

    generate_service_cert "mcp-hr" "DNS.1 = mcp-hr
DNS.2 = localhost"

    generate_service_cert "mcp-finance" "DNS.1 = mcp-finance
DNS.2 = localhost"

    generate_service_cert "mcp-sales" "DNS.1 = mcp-sales
DNS.2 = localhost"

    generate_service_cert "mcp-support" "DNS.1 = mcp-support
DNS.2 = localhost"

    generate_service_cert "postgres" "DNS.1 = postgres
DNS.2 = localhost"

    generate_service_cert "redis" "DNS.1 = redis
DNS.2 = localhost"

    generate_service_cert "mongodb" "DNS.1 = mongodb
DNS.2 = localhost"

    generate_service_cert "keycloak" "DNS.1 = keycloak
DNS.2 = localhost"

    # Generate combined PEM files for services that need them
    generate_combined_pem "redis"
    generate_combined_pem "mongodb"

    echo ""
    echo "=============================================="
    log_info "All certificates generated successfully!"
    echo "=============================================="
    echo ""
    echo "Generated files in $CERTS_DIR:"
    ls -la "$CERTS_DIR"
    echo ""
    echo "Next steps:"
    echo "  1. Use docker-compose.mtls.yml overlay for mTLS"
    echo "  2. docker compose -f docker-compose.yml -f docker-compose.mtls.yml up -d"
    echo ""
    log_warn "IMPORTANT: Add 'infrastructure/docker/certs/' to .gitignore"
    log_warn "Never commit private keys to version control!"
}

main "$@"
