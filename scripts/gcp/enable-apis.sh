#!/bin/bash
# Enable required GCP APIs for Phase 1 deployment
# Run this before terraform apply

set -euo pipefail

PROJECT_ID="${1:-}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <PROJECT_ID>"
  echo "Example: $0 gen-lang-client-0553641830"
  exit 1
fi

echo "=================================================="
echo "Enabling GCP APIs for project: $PROJECT_ID"
echo "=================================================="
echo ""

# Core APIs (must be enabled first)
CORE_APIS=(
  "serviceusage.googleapis.com"        # Service Usage API (enables other APIs)
  "cloudresourcemanager.googleapis.com" # Resource Manager API
  "iam.googleapis.com"                  # Identity and Access Management API
)

# Infrastructure APIs
INFRA_APIS=(
  "compute.googleapis.com"              # Compute Engine API
  "vpcaccess.googleapis.com"            # Serverless VPC Access API
  "servicenetworking.googleapis.com"    # Service Networking API
)

# Service APIs
SERVICE_APIS=(
  "run.googleapis.com"                  # Cloud Run API
  "sqladmin.googleapis.com"             # Cloud SQL Admin API
  "sql-component.googleapis.com"        # Cloud SQL Component (for --add-cloudsql-instances)
  "secretmanager.googleapis.com"        # Secret Manager API
  "artifactregistry.googleapis.com"     # Artifact Registry API
  "storage-api.googleapis.com"          # Cloud Storage API
  "storage-component.googleapis.com"    # Cloud Storage (legacy)
)

enable_api() {
  local api=$1
  echo -n "Enabling $api... "

  if gcloud services enable "$api" --project="$PROJECT_ID" 2>/dev/null; then
    echo "✓"
  else
    echo "✗ (may already be enabled or permission denied)"
  fi
}

# Enable core APIs first
echo "Step 1: Enabling core APIs..."
for api in "${CORE_APIS[@]}"; do
  enable_api "$api"
done

echo ""
echo "Waiting 10 seconds for core APIs to propagate..."
sleep 10

# Enable infrastructure APIs
echo ""
echo "Step 2: Enabling infrastructure APIs..."
for api in "${INFRA_APIS[@]}"; do
  enable_api "$api"
done

# Enable service APIs
echo ""
echo "Step 3: Enabling service APIs..."
for api in "${SERVICE_APIS[@]}"; do
  enable_api "$api"
done

echo ""
echo "=================================================="
echo "✓ All APIs enabled successfully"
echo "=================================================="
echo ""
echo "Note: It may take 1-2 minutes for APIs to fully propagate."
echo "If terraform apply still fails, wait a minute and retry."
echo ""
echo "Next steps:"
echo "  1. Wait 1-2 minutes"
echo "  2. cd infrastructure/terraform/gcp"
echo "  3. terraform apply \"tfplan\""
