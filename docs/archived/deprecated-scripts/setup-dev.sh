#!/bin/bash
# =============================================================================
# ⚠️  DEPRECATED - Use Terraform workflow instead
# =============================================================================
#
# This script is deprecated. Please use the Terraform-based setup:
#
#   cd infrastructure/terraform/dev
#   terraform init
#   terraform apply -var-file=dev.tfvars
#
# See infrastructure/terraform/dev/README.md for full instructions.
# This script remains for legacy compatibility only.
#
# =============================================================================

# Tamshai Corp Enterprise AI - Development Setup Script
# This script sets up the local development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Tamshai Corp Enterprise AI Setup${NC}"
echo -e "${BLUE}========================================${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $1 is installed"
        return 0
    else
        echo -e "  ${RED}✗${NC} $1 is NOT installed"
        return 1
    fi
}

MISSING_DEPS=0

check_command "docker" || MISSING_DEPS=1
check_command "docker-compose" || check_command "docker compose" || MISSING_DEPS=1
check_command "node" || MISSING_DEPS=1
check_command "npm" || MISSING_DEPS=1

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "\n${RED}Missing dependencies. Please install them first.${NC}"
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker is running"

# Check/setup hosts file for tamshai.local
echo -e "\n${YELLOW}Checking hosts file for tamshai.local...${NC}"

HOSTS_ENTRY="127.0.0.1  tamshai.local www.tamshai.local"

# Detect OS and hosts file location
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -f /c/Windows/System32/drivers/etc/hosts ]]; then
    # Windows (Git Bash, MSYS, or WSL with Windows hosts file access)
    HOSTS_FILE="/c/Windows/System32/drivers/etc/hosts"
    IS_WINDOWS=true
elif [[ -f /mnt/c/Windows/System32/drivers/etc/hosts ]]; then
    # WSL
    HOSTS_FILE="/mnt/c/Windows/System32/drivers/etc/hosts"
    IS_WINDOWS=true
else
    # Linux/Mac
    HOSTS_FILE="/etc/hosts"
    IS_WINDOWS=false
fi

if grep -q "tamshai.local" "$HOSTS_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} tamshai.local already in hosts file"
else
    echo -e "  ${YELLOW}!${NC} tamshai.local not found in hosts file"
    if [ "$IS_WINDOWS" = true ]; then
        echo -e "  ${YELLOW}!${NC} Run this PowerShell command as Administrator:"
        echo -e "  ${BLUE}Add-Content -Path C:\\Windows\\System32\\drivers\\etc\\hosts -Value '${HOSTS_ENTRY}'${NC}"
    else
        echo -e "  ${YELLOW}!${NC} Run: sudo bash -c 'echo \"${HOSTS_ENTRY}\" >> /etc/hosts'"
    fi
    echo -e "  ${YELLOW}!${NC} This enables https://www.tamshai.local access"
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Create .env file if it doesn't exist
echo -e "\n${YELLOW}Setting up environment...${NC}"

if [ ! -f "infrastructure/docker/.env" ]; then
    cp infrastructure/docker/.env.example infrastructure/docker/.env
    echo -e "  ${GREEN}✓${NC} Created .env file from template"
    echo -e "  ${YELLOW}!${NC} Please edit infrastructure/docker/.env to add your CLAUDE_API_KEY"
else
    echo -e "  ${GREEN}✓${NC} .env file already exists"
fi

# Make scripts executable
chmod +x scripts/*.sh 2>/dev/null || true

# Make postgres init script executable
chmod +x infrastructure/docker/postgres/init-multiple-databases.sh

# Install dependencies for MCP Gateway
echo -e "\n${YELLOW}Installing MCP Gateway dependencies...${NC}"
cd services/mcp-gateway
if [ -f "package.json" ]; then
    npm install
    echo -e "  ${GREEN}✓${NC} MCP Gateway dependencies installed"
fi
cd "$PROJECT_ROOT"

# Build services
echo -e "\n${YELLOW}Building Docker images...${NC}"
cd infrastructure/docker

# Check if we should use 'docker compose' or 'docker-compose'
if command -v "docker compose" &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

$COMPOSE_CMD build --parallel
echo -e "  ${GREEN}✓${NC} Docker images built"

# Start services
echo -e "\n${YELLOW}Starting services...${NC}"
$COMPOSE_CMD up -d redis postgres mongodb elasticsearch minio

echo -e "  ${YELLOW}Waiting for databases to be ready...${NC}"
sleep 10

# Start remaining services
$COMPOSE_CMD up -d

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${BLUE}Services are starting up. Please wait a few minutes for all services to be ready.${NC}"
echo -e "\n${YELLOW}Access Points:${NC}"
echo -e "  ${GREEN}Tamshai Local:${NC}      https://www.tamshai.local (requires hosts file entry)"
echo -e "                      Accept the self-signed certificate warning"
echo -e ""
echo -e "  Keycloak Admin:     http://localhost:8180 or https://tamshai.local/auth"
echo -e "                      Username: admin"
echo -e "                      Password: admin"
echo -e ""
echo -e "  API Gateway:        http://localhost:8100 or https://tamshai.local/api"
echo -e "  MCP Gateway:        http://localhost:3100"
echo -e "  MinIO Console:      http://localhost:9102"
echo -e "                      Username: minioadmin"
echo -e "                      Password: minioadmin"
echo -e ""
echo -e "${YELLOW}Database Ports (if needed for direct access):${NC}"
echo -e "  PostgreSQL:         localhost:5433"
echo -e "  MongoDB:            localhost:27018"
echo -e "  Elasticsearch:      localhost:9201"
echo -e "  Redis:              localhost:6380 (token revocation)"
echo -e ""
echo -e "${YELLOW}Test Users (password: [REDACTED-DEV-PASSWORD]):${NC}"
echo -e "  HR:        alice.chen       (hr-read, hr-write, manager)"
echo -e "  Finance:   bob.martinez     (finance-read, finance-write, manager)"
echo -e "  Sales:     carol.johnson    (sales-read, sales-write, manager)"
echo -e "  Support:   dan.williams     (support-read, manager)"
echo -e "  Executive: eve.thompson     (executive, manager - CEO)"
echo -e "  Intern:    frank.davis      (no special permissions)"
echo -e "  Eng Mgr:   nina.patel       (manager)"
echo -e "  Engineer:  marcus.johnson   (no special permissions)"
echo -e ""
echo -e "${YELLOW}MFA Setup:${NC}"
echo -e "  All users must configure TOTP (Google Authenticator) on first login."
echo -e "  Each user receives 8 recovery codes - store these securely!"
echo -e ""
echo -e "${YELLOW}To check service status:${NC}"
echo -e "  cd infrastructure/docker && $COMPOSE_CMD ps"
echo -e ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  cd infrastructure/docker && $COMPOSE_CMD logs -f [service-name]"
echo -e ""
echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  cd infrastructure/docker && $COMPOSE_CMD down"
echo -e ""
echo -e "${BLUE}Note: These ports are configured to avoid conflicts with${NC}"
echo -e "${BLUE}the existing MCP dev environment (port 8443, subnet 172.28.0.0/16)${NC}"
echo -e ""
echo -e "${RED}IMPORTANT:${NC} Don't forget to add your CLAUDE_API_KEY to infrastructure/docker/.env"
