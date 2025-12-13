#!/bin/bash
#
# Production Configuration Validator
#
# Security Review Finding: Hardcoded default credentials must not be used in production.
# This script validates that production deployments have properly configured secrets.
#
# Usage: ./scripts/validate-production-config.sh [--strict]
#   --strict: Fail on any warning (recommended for CI/CD)
#

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

STRICT_MODE=false
ERRORS=0
WARNINGS=0

if [[ "$1" == "--strict" ]]; then
    STRICT_MODE=true
fi

echo "=========================================="
echo "Production Configuration Validator"
echo "=========================================="
echo ""

# Default credentials that MUST NOT be used in production
declare -A FORBIDDEN_DEFAULTS=(
    ["POSTGRES_PASSWORD"]="postgres_password tamshai_password tamshai123"
    ["KEYCLOAK_ADMIN_PASSWORD"]="admin"
    ["MONGODB_ROOT_PASSWORD"]="admin123 tamshai_password"
    ["MONGODB_PASSWORD"]="tamshai123 tamshai_password"
    ["REDIS_PASSWORD"]=""
    ["CLAUDE_API_KEY"]="sk-ant-api03-EXAMPLE"
    ["MINIO_ROOT_PASSWORD"]="minioadmin"
)

# Check environment variables
check_env_var() {
    local var_name=$1
    local forbidden_values=$2
    local current_value="${!var_name}"

    if [[ -z "$current_value" ]]; then
        echo -e "${YELLOW}[WARN]${NC} $var_name is not set"
        ((WARNINGS++))
        return
    fi

    for forbidden in $forbidden_values; do
        if [[ "$current_value" == "$forbidden" ]]; then
            echo -e "${RED}[FAIL]${NC} $var_name is using default/insecure value: $forbidden"
            ((ERRORS++))
            return
        fi
    done

    # Check for weak passwords (less than 12 chars)
    if [[ ${#current_value} -lt 12 && "$var_name" == *"PASSWORD"* ]]; then
        echo -e "${YELLOW}[WARN]${NC} $var_name appears weak (less than 12 characters)"
        ((WARNINGS++))
        return
    fi

    echo -e "${GREEN}[PASS]${NC} $var_name is configured"
}

echo "Checking environment variables..."
echo ""

for var_name in "${!FORBIDDEN_DEFAULTS[@]}"; do
    check_env_var "$var_name" "${FORBIDDEN_DEFAULTS[$var_name]}"
done

echo ""

# Check docker-compose.yml for hardcoded defaults
echo "Checking docker-compose.yml for hardcoded secrets..."
COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker/docker-compose.yml}"

if [[ -f "$COMPOSE_FILE" ]]; then
    # Check for hardcoded passwords in compose file
    HARDCODED_PATTERNS=(
        "password123"
        "admin123"
        "tamshai_password"
        "tamshai123"
        "keycloak_password"
        "postgres_password"
        "minioadmin"
    )

    for pattern in "${HARDCODED_PATTERNS[@]}"; do
        if grep -q "$pattern" "$COMPOSE_FILE" 2>/dev/null; then
            echo -e "${RED}[FAIL]${NC} Found hardcoded credential in $COMPOSE_FILE: $pattern"
            ((ERRORS++))
        fi
    done

    # Check if using ${VAR} syntax (environment variable substitution)
    if grep -qE '\$\{[A-Z_]+\}' "$COMPOSE_FILE"; then
        echo -e "${GREEN}[PASS]${NC} docker-compose.yml uses environment variable substitution"
    else
        echo -e "${YELLOW}[WARN]${NC} docker-compose.yml may not be using environment variables for secrets"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}[WARN]${NC} docker-compose.yml not found at $COMPOSE_FILE"
    ((WARNINGS++))
fi

echo ""

# Check for .env file with production secrets
echo "Checking .env file..."
ENV_FILE="${ENV_FILE:-infrastructure/docker/.env}"

if [[ -f "$ENV_FILE" ]]; then
    echo -e "${GREEN}[INFO]${NC} .env file found at $ENV_FILE"

    # Verify .env is in .gitignore
    if grep -q "\.env" .gitignore 2>/dev/null; then
        echo -e "${GREEN}[PASS]${NC} .env is listed in .gitignore"
    else
        echo -e "${RED}[FAIL]${NC} .env is NOT in .gitignore - secrets may be committed!"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}[WARN]${NC} No .env file found - ensure secrets are injected via CI/CD"
    ((WARNINGS++))
fi

echo ""

# Check Keycloak token helper script
echo "Checking helper scripts for hardcoded credentials..."
HELPER_SCRIPTS=(
    "scripts/get-keycloak-token.sh"
)

for script in "${HELPER_SCRIPTS[@]}"; do
    if [[ -f "$script" ]]; then
        if grep -qE "(password123|admin123)" "$script"; then
            echo -e "${YELLOW}[WARN]${NC} $script contains default test credentials (OK for dev, not for prod)"
            ((WARNINGS++))
        fi
    fi
done

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}FAILED: Configuration is not production-ready${NC}"
    exit 1
fi

if [[ $STRICT_MODE == true && $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}FAILED (strict mode): Warnings present${NC}"
    exit 1
fi

if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}PASSED with warnings${NC}"
    exit 0
fi

echo -e "${GREEN}PASSED: Configuration appears production-ready${NC}"
exit 0
