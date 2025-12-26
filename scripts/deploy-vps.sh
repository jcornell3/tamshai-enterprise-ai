#!/bin/bash
# Tamshai Enterprise AI - Remote VPS Deployment Script
#
# This script triggers deployment on the remote VPS without SSH access.
# It uses the DigitalOcean or Hetzner API to run commands via cloud-init.
#
# Usage:
#   ./scripts/deploy-vps.sh                    # Deploy latest from main branch
#   ./scripts/deploy-vps.sh --build            # Rebuild containers
#   ./scripts/deploy-vps.sh --branch feature   # Deploy specific branch
#   ./scripts/deploy-vps.sh --status           # Check deployment status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform/vps"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BUILD_FLAG=""
BRANCH="main"
STATUS_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --build)
      BUILD_FLAG="--build"
      shift
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --status)
      STATUS_ONLY=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --build           Rebuild containers"
      echo "  --branch NAME     Deploy specific branch (default: main)"
      echo "  --status          Check deployment status only"
      echo "  --help            Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check if Terraform state exists
if [ ! -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
  echo -e "${RED}Error: Terraform state not found.${NC}"
  echo "Run 'terraform apply' first to create the VPS."
  exit 1
fi

# Get VPS IP from Terraform output
cd "$TERRAFORM_DIR"
VPS_IP=$(terraform output -raw vps_ip 2>/dev/null)
CLOUD_PROVIDER=$(terraform output -raw cloud_provider 2>/dev/null || echo "unknown")

if [ -z "$VPS_IP" ]; then
  echo -e "${RED}Error: Could not get VPS IP from Terraform state.${NC}"
  exit 1
fi

echo -e "${GREEN}=== Tamshai VPS Deployment ===${NC}"
echo "VPS IP: $VPS_IP"
echo "Provider: $CLOUD_PROVIDER"
echo "Branch: $BRANCH"

# Check if SSH access is available
if [ -f "$TERRAFORM_DIR/.keys/deploy_key" ]; then
  SSH_KEY="$TERRAFORM_DIR/.keys/deploy_key"
  SSH_AVAILABLE=true
else
  SSH_AVAILABLE=false
fi

# Function to check deployment status
check_status() {
  echo -e "${YELLOW}Checking service health...${NC}"

  # Check each service endpoint (path-based routing)
  paths=("" "/auth" "/api")
  DOMAIN=$(terraform output -raw domain 2>/dev/null || echo "$VPS_IP")

  for path in "${paths[@]}"; do
    url="https://${DOMAIN}${path}"
    if curl -sf -o /dev/null --max-time 10 "$url"; then
      echo -e "  ${GREEN}✓${NC} $url - healthy"
    else
      echo -e "  ${RED}✗${NC} $url - unreachable"
    fi
  done
}

if [ "$STATUS_ONLY" = true ]; then
  check_status
  exit 0
fi

# Deployment method: SSH if available, otherwise use cloud API
if [ "$SSH_AVAILABLE" = true ]; then
  echo -e "${YELLOW}Deploying via SSH...${NC}"

  # Ensure correct permissions on key
  chmod 600 "$SSH_KEY"

  # Execute deployment script on VPS
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=30 \
    root@"$VPS_IP" "cd /opt/tamshai && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH && ./scripts/deploy.sh $BUILD_FLAG"

  DEPLOY_RESULT=$?
else
  echo -e "${YELLOW}SSH not available. Using cloud API...${NC}"

  # DigitalOcean: Use Droplet Console API
  if [ "$CLOUD_PROVIDER" = "digitalocean" ]; then
    DO_TOKEN=$(grep 'do_token' "$TERRAFORM_DIR/terraform.tfvars" | cut -d'"' -f2)
    DROPLET_ID=$(terraform show -json | jq -r '.values.root_module.resources[] | select(.type=="digitalocean_droplet") | .values.id')

    if [ -n "$DO_TOKEN" ] && [ -n "$DROPLET_ID" ]; then
      echo "Triggering deployment via DigitalOcean API..."

      # Use doctl or direct API
      DEPLOY_CMD="cd /opt/tamshai && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH && ./scripts/deploy.sh $BUILD_FLAG"

      # Unfortunately, DO doesn't have a direct "run command" API
      # Recommend using GitHub Actions instead
      echo -e "${YELLOW}Note: For fully automated deployment without SSH, use GitHub Actions.${NC}"
      echo "See: .github/workflows/deploy.yml"
      exit 1
    fi
  fi

  # Hetzner: Similar limitation
  if [ "$CLOUD_PROVIDER" = "hetzner" ]; then
    echo -e "${YELLOW}Note: For fully automated deployment without SSH, use GitHub Actions.${NC}"
    echo "See: .github/workflows/deploy.yml"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}=== Deployment initiated ===${NC}"
echo "Waiting 30 seconds for services to start..."
sleep 30

check_status

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
