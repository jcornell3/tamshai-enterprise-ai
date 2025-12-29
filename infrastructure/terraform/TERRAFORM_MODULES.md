# Terraform Modules Documentation - GCP Production

## Overview

**IMPORTANT: This documentation covers GCP production infrastructure only.**
- **For staging (VPS)**: See `infrastructure/terraform/vps/README.md`
- **For development (Docker)**: See `CLAUDE.md` Section: "Development Environment"

The Tamshai Enterprise AI **GCP production** infrastructure has been modularized into reusable, composable Terraform modules following industry best practices. This document explains the module architecture, usage patterns, and testing guidelines.

**Benefits of Modularization:**
- **DRY Principle**: Reusable components eliminate code duplication
- **Blast Radius Reduction**: Changes isolated to single module scope
- **Independent Testing**: Each module can be validated separately
- **Clear Ownership**: Domain-specific modules with single responsibility
- **Composition**: Root module orchestrates infrastructure from building blocks

**Statistics:**
- **Before**: 831-line monolithic `main.tf`
- **After**: 150-line root + 5 focused modules (82% reduction in root complexity)

---

## Module Architecture

```
infrastructure/terraform/
├── main.tf                     # Root module (GCP production orchestration)
├── variables.tf                # Root variables
├── outputs.tf                  # Aggregated outputs
├── README.md                   # Deployment architecture guide (START HERE)
├── TERRAFORM_MODULES.md        # This file - module documentation
├── environments/               # Environment-specific configs
│   └── production.tfvars       # GCP production (~$150-200/month)
├── vps/                        # VPS staging deployment (separate)
│   ├── main.tf                 # VPS provisioning
│   ├── cloud-init.yaml         # Automated setup
│   └── terraform.tfvars        # Staging configuration
└── modules/                    # Reusable GCP modules
    ├── networking/             # VPC, subnets, NAT, firewall
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── security/               # IAM, Secret Manager, passwords
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── database/               # Cloud SQL PostgreSQL
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── storage/                # Cloud Storage buckets
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── compute/                # GCE instances
        ├── main.tf
        ├── variables.tf
        ├── outputs.tf
        └── scripts/
            ├── keycloak-startup.sh
            └── mcp-gateway-startup.sh
```

---

## Module Descriptions

### 1. Networking Module (`modules/networking/`)

**Purpose**: Manages all network infrastructure including VPC, subnets, Cloud NAT, and firewall rules.

**Resources Created:**
- Google Compute Network (VPC)
- Google Compute Subnetwork with flow logging
- Cloud Router for NAT
- Cloud NAT Gateway
- Firewall Rules:
  - HTTP/HTTPS ingress (configurable ports)
  - SSH via IAP (Identity-Aware Proxy)
  - Internal communication (all protocols)

**Key Variables:**
- `subnet_cidr` - CIDR range for subnet (default: `10.0.0.0/24`)
- `allowed_http_ports` - HTTP/HTTPS ports (default: `["80", "443", "8080", "8000", "3000", "3100"]`)
- `http_source_ranges` - IP allowlist (default: `["0.0.0.0/0"]`)

**Outputs:**
- `network_id` - Network ID for cross-references
- `network_self_link` - Full network resource path
- `subnet_id` - Subnet ID for instance placement
- `subnet_cidr` - CIDR for network planning

**Example Usage:**
```hcl
module "networking" {
  source = "./modules/networking"

  project_id         = var.project_id
  region             = var.region
  environment        = local.environment
  subnet_cidr        = "10.0.0.0/24"
  allowed_http_ports = ["443", "8080"]  # Production: HTTPS only
  http_source_ranges = ["203.0.113.0/24"]  # Restrict to office IP
}
```

**Testing:**
```bash
cd modules/networking
terraform init
terraform validate
terraform plan -var="project_id=test" -var="region=us-west1" -var="environment=test"
```

---

### 2. Security Module (`modules/security/`)

**Purpose**: Manages service accounts, Secret Manager secrets, IAM bindings, and password generation.

**Resources Created:**
- **Service Accounts** (3):
  - Keycloak Identity Provider
  - MCP Gateway AI Orchestrator
  - MCP HR Data Access
- **Secret Manager Secrets** (6):
  - Anthropic API Key (manual upload)
  - Keycloak Admin Password (auto-generated)
  - Keycloak DB Password (auto-generated)
  - Tamshai DB Password (auto-generated)
  - MCP Gateway Session Secret (auto-generated)
  - JWT Secret (auto-generated)
- **IAM Bindings**:
  - Service accounts granted Secret Manager accessor role
  - Compute instances use service accounts via metadata

**Key Features:**
- **Automatic Password Generation**: 24-character passwords with special characters
- **Secret Versioning**: All secrets support multiple versions
- **Least Privilege**: Each service account scoped to minimum required permissions
- **Sensitive Outputs**: Passwords marked `sensitive = true` to prevent console display

**Outputs:**
- `keycloak_service_account_email` - For compute instance assignment
- `mcp_gateway_service_account_email` - For compute instance assignment
- `mcp_hr_service_account_email` - For compute instance assignment
- `keycloak_admin_password` - **SENSITIVE** - For Keycloak configuration
- `keycloak_db_password` - **SENSITIVE** - For database module
- `tamshai_db_password` - **SENSITIVE** - For database module
- `secret_ids` - Map of all Secret Manager secret IDs

**Example Usage:**
```hcl
module "security" {
  source = "./modules/security"

  project_id  = var.project_id
  environment = local.environment
}

# Use outputs in other modules
module "database" {
  source = "./modules/database"
  # ...
  keycloak_db_password = module.security.keycloak_db_password
  tamshai_db_password  = module.security.tamshai_db_password
}
```

**Secrets Management Workflow:**
1. Terraform creates secret placeholders
2. Administrator uploads Anthropic API key manually:
   ```bash
   echo "sk-ant-api03-YOUR-KEY" | gcloud secrets versions add \
     tamshai-dev-anthropic-api-key --data-file=-
   ```
3. Other secrets auto-generated and versioned
4. Compute instances fetch secrets at runtime via metadata service

**Testing:**
```bash
cd modules/security
terraform init
terraform validate
terraform plan -var="project_id=test" -var="environment=test"
```

---

### 3. Database Module (`modules/database/`)

**Purpose**: Manages Cloud SQL PostgreSQL instance, databases, and users with private networking.

**Resources Created:**
- **Private IP Range**: VPC peering for Cloud SQL
- **Service Networking Connection**: Links VPC to Cloud SQL
- **PostgreSQL Instance** (v16):
  - Private IP only (no public IP)
  - Automated backups (production)
  - High availability (production)
  - Point-in-time recovery
- **Databases** (3):
  - `keycloak` - Identity provider storage
  - `tamshai_hr` - HR employee data
  - `tamshai_finance` - Financial records
- **Database Users** (2):
  - `keycloak` - Keycloak service user
  - `tamshai` - Application user

**Key Variables:**
- `database_version` - PostgreSQL version (default: `POSTGRES_16`)
- `database_tier` - Instance size (default: `db-f1-micro`)
- `disk_size_gb` - Storage size (default: `10`)
- `enable_backups` - Automated backups (default: environment-dependent)
- `deletion_protection` - Prevent accidental deletion (default: production only)
- `keycloak_db_password` - **SENSITIVE** - From security module
- `tamshai_db_password` - **SENSITIVE** - From security module

**Outputs:**
- `postgres_instance_name` - Instance name for connection
- `postgres_connection_name` - Full connection string
- `postgres_private_ip` - Internal IP for application connections
- `keycloak_db_name` - Database name for Keycloak
- `hr_db_name` - Database name for HR data
- `finance_db_name` - Database name for finance data

**GCP Production Configuration:**

| Tier | Disk | Backups | HA | Cost |
|------|------|---------|-----|------|
| db-custom-2-7680 | 50 GB | Yes | Yes | ~$80/mo |

**Note**: For staging (VPS) and development (Docker Compose), PostgreSQL is deployed via Docker containers, not Cloud SQL. See `infrastructure/terraform/vps/` for staging database configuration.

**Example Usage:**
```hcl
module "database" {
  source = "./modules/database"

  project_id          = var.project_id
  region              = var.region
  environment         = local.environment
  network_id          = module.networking.network_self_link
  database_version    = "POSTGRES_16"
  database_tier       = "db-f1-micro"
  disk_size_gb        = 10
  enable_backups      = local.is_production
  deletion_protection = local.is_production

  # Passwords from security module
  keycloak_db_password = module.security.keycloak_db_password
  tamshai_db_password  = module.security.tamshai_db_password

  depends_on = [module.networking]
}
```

**Connection Pattern:**
```bash
# From GCE instance (using private IP)
psql -h 10.0.0.3 -U keycloak -d keycloak

# From Cloud SQL Proxy (for local development)
cloud-sql-proxy tamshai-dev-postgres:us-west1:tamshai-dev-postgres
psql -h 127.0.0.1 -U keycloak -d keycloak
```

**Testing:**
```bash
cd modules/database
terraform init
terraform validate
# Note: Requires network_id from networking module for full plan
```

---

### 4. Storage Module (`modules/storage/`)

**Purpose**: Manages Cloud Storage buckets for document storage with lifecycle policies.

**Resources Created:**
- **Finance Documents Bucket**:
  - Uniform bucket-level access (no ACLs)
  - Versioning (production only)
  - Lifecycle policy (age-based deletion)
  - Encryption at rest (Google-managed)
- **Public Documents Bucket**:
  - Same configuration as finance bucket
  - Intended for non-sensitive shared files

**Key Variables:**
- `force_destroy` - Allow bucket deletion when not empty (default: non-production only)
- `enable_versioning` - Object versioning (default: production only)
- `lifecycle_age_days` - Delete objects older than X days (default: 365)

**Outputs:**
- `finance_docs_bucket_name` - Bucket name for application config
- `finance_docs_bucket_url` - gs:// URL for gsutil
- `public_docs_bucket_name` - Bucket name for application config
- `public_docs_bucket_url` - gs:// URL for gsutil

**GCP Production Configuration:**

| Versioning | Lifecycle | Force Destroy | Retention |
|------------|-----------|---------------|-----------|
| Yes | 2555 days (7 years) | No | Compliance |

**Note**: For staging (VPS) and development (Docker), object storage uses MinIO deployed via Docker. See `infrastructure/terraform/vps/` for staging storage configuration.

**Example Usage:**
```hcl
module "storage" {
  source = "./modules/storage"

  project_id         = var.project_id
  region             = var.region
  environment        = local.environment
  force_destroy      = !local.is_production
  enable_versioning  = local.is_production
  lifecycle_age_days = local.is_production ? 2555 : 90
}
```

**Access Control:**
```bash
# Grant service account read access
gsutil iam ch serviceAccount:mcp-gateway@project.iam.gserviceaccount.com:objectViewer \
  gs://tamshai-dev-finance-docs-project-id

# Upload file
gsutil cp invoice.pdf gs://tamshai-dev-finance-docs-project-id/2024/
```

**Testing:**
```bash
cd modules/storage
terraform init
terraform validate
terraform plan -var="project_id=test" -var="region=us-west1" -var="environment=test"
```

---

### 5. Compute Module (`modules/compute/`)

**Purpose**: Manages Google Compute Engine instances for Keycloak and MCP Gateway with startup scripts.

**Resources Created:**
- **Keycloak Instance**:
  - Machine type: e2-small (staging/prod) or e2-micro (dev)
  - Boot disk: 20-50 GB persistent SSD
  - Tags: `web-server`, `ssh-enabled`
  - Shielded VM: Secure boot + vTPM + integrity monitoring
  - Startup script: Installs Docker, runs Keycloak container
- **MCP Gateway Instance**:
  - Machine type: e2-micro (dev) or e2-small (prod)
  - Boot disk: 10-30 GB persistent SSD
  - Tags: `web-server`, `ssh-enabled`
  - Shielded VM enabled
  - Startup script: Runs MCP Gateway with Claude API

**Key Variables:**
- `machine_type` - Instance size for MCP Gateway (default: `e2-micro`)
- `machine_type_medium` - Instance size for Keycloak (default: `e2-small`)
- `boot_disk_size_keycloak` - Disk size in GB (default: `20`)
- `boot_disk_size_gateway` - Disk size in GB (default: `10`)
- `preemptible` - Use preemptible instances (default: non-production only)
- `automatic_restart` - Auto-restart on maintenance (default: production only)
- `keycloak_service_account_email` - From security module
- `mcp_gateway_service_account_email` - From security module
- `postgres_private_ip` - From database module

**Startup Scripts:**

Both instances use `templatefile()` to parameterize startup scripts:

**keycloak-startup.sh** (44 lines):
```bash
#!/bin/bash
set -e

# Fetch secrets from Secret Manager at runtime
KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-keycloak-admin-password" \
  --project="${project_id}")

KEYCLOAK_DB_PASSWORD=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-keycloak-db-password" \
  --project="${project_id}")

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Run Keycloak container
docker run -d \
  --name keycloak \
  --restart unless-stopped \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  -e KC_DB=postgres \
  -e KC_DB_URL="jdbc:postgresql://${postgres_private_ip}:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak \
  -e KC_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
  quay.io/keycloak/keycloak:24.0 start-dev

# Clear sensitive variables from memory
unset KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_DB_PASSWORD
```

**mcp-gateway-startup.sh** (60 lines):
```bash
#!/bin/bash
set -e

# Fetch secrets from Secret Manager
ANTHROPIC_API_KEY=$(gcloud secrets versions access latest \
  --secret="tamshai-${environment}-anthropic-api-key" \
  --project="${project_id}")

# Create environment file in tmpfs (RAM disk)
mkdir -p /run/mcp-gateway
mount -t tmpfs -o size=1M tmpfs /run/mcp-gateway

cat > /run/mcp-gateway/.env <<EOF
CLAUDE_API_KEY=$ANTHROPIC_API_KEY
KEYCLOAK_ISSUER=http://${keycloak_internal_ip}:8080/realms/tamshai
POSTGRES_HOST=${postgres_private_ip}
EOF

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Clone and run MCP Gateway
git clone https://github.com/tamshai/mcp-gateway.git /opt/mcp-gateway
cd /opt/mcp-gateway
npm install
npm run build
npm start

# Clear sensitive variables
unset ANTHROPIC_API_KEY
rm -rf /run/mcp-gateway
```

**Security Best Practices:**
- Secrets fetched at runtime (never hardcoded)
- Environment variables cleared after use
- tmpfs used for sensitive files (RAM, not disk)
- Shielded VM for boot integrity
- Service accounts with least privilege

**Outputs:**
- `keycloak_instance_name` - Instance name
- `keycloak_internal_ip` - Private IP for inter-service communication
- `keycloak_external_ip` - Public IP for external access
- `keycloak_url` - Full HTTP URL (e.g., `http://35.203.XXX.XXX:8080`)
- `mcp_gateway_instance_name` - Instance name
- `mcp_gateway_internal_ip` - Private IP
- `mcp_gateway_external_ip` - Public IP
- `mcp_gateway_url` - Full HTTP URL (e.g., `http://35.203.XXX.XXX:3100`)

**Example Usage:**
```hcl
module "compute" {
  source = "./modules/compute"

  project_id                       = var.project_id
  region                           = var.region
  zone                             = var.zone
  environment                      = local.environment
  subnet_id                        = module.networking.subnet_id
  machine_type                     = var.machine_type
  machine_type_medium              = var.machine_type_medium
  boot_disk_size_keycloak          = var.boot_disk_size_keycloak
  boot_disk_size_gateway           = var.boot_disk_size_gateway
  preemptible                      = !local.is_production
  automatic_restart                = local.is_production
  keycloak_service_account_email   = module.security.keycloak_service_account_email
  mcp_gateway_service_account_email = module.security.mcp_gateway_service_account_email
  postgres_private_ip              = module.database.postgres_private_ip

  depends_on = [module.database, module.security]
}
```

**SSH Access (via IAP):**
```bash
# SSH without opening firewall ports (recommended)
gcloud compute ssh tamshai-dev-keycloak \
  --zone=us-west1-b \
  --tunnel-through-iap

# View startup script logs
gcloud compute ssh tamshai-dev-keycloak --zone=us-west1-b \
  --command="sudo journalctl -u google-startup-scripts.service"
```

**Testing:**
```bash
cd modules/compute
terraform init
terraform validate
# Note: Requires outputs from networking, security, and database modules
```

---

## Module Dependencies

**Dependency Graph:**

```
networking (no dependencies)
   ├─> database (requires network_id)
   │      └─> compute (requires postgres_private_ip)
   └─> compute (requires subnet_id)

security (no dependencies)
   ├─> database (requires passwords)
   └─> compute (requires service_account_emails)
```

**Execution Order:**

Terraform automatically resolves dependencies, but the logical order is:

1. **networking** + **security** (parallel, no dependencies)
2. **database** (depends on networking + security)
3. **storage** (no dependencies, can run anytime)
4. **compute** (depends on networking + security + database)

**Explicit `depends_on` Usage:**

```hcl
module "database" {
  # ...
  depends_on = [module.networking]
}

module "compute" {
  # ...
  depends_on = [module.database, module.security]
}
```

---

## Usage Examples

### Deploying GCP Production Environment

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Select production workspace
terraform workspace select tamshai-production

# Plan with production variables
terraform plan -var-file=environments/production.tfvars

# Review plan carefully before applying
# Apply
terraform apply -var-file=environments/production.tfvars

# View outputs
terraform output

# Outputs include:
# - keycloak_url
# - mcp_gateway_url
# - postgres_private_ip
# - secret_manager_instructions
# - ssh_instructions
# - estimated_monthly_cost (~$150-200/month)
```

**Post-Deployment Steps:**
```bash
# Upload Anthropic API key (manual step - production only)
echo "sk-ant-api03-PROD-KEY" | gcloud secrets versions add \
  tamshai-production-anthropic-api-key --data-file=-

# Restart MCP Gateway to pick up new secret
gcloud compute instances reset tamshai-production-mcp-gateway \
  --zone=us-central1-a
```

**For staging deployment (VPS):**
```bash
cd infrastructure/terraform/vps
terraform init
terraform plan
terraform apply
# See vps/README.md for detailed instructions
```

### Updating a Single Module

```bash
# Example: Update networking module to restrict HTTP ports

# 1. Edit environments/production.tfvars
allowed_http_ports = ["443"]  # HTTPS only

# 2. Plan (only networking changes shown)
terraform plan -var-file=environments/production.tfvars -target=module.networking

# 3. Apply
terraform apply -var-file=environments/production.tfvars -target=module.networking

# Note: -target should be used sparingly; prefer full plans
```

### Testing Individual Modules

```bash
# Test networking module in isolation
cd modules/networking
terraform init
terraform validate

# Create test variables
cat > test.tfvars <<EOF
project_id = "test-project"
region = "us-west1"
environment = "test"
EOF

# Plan (will fail without actual GCP project, but validates syntax)
terraform plan -var-file=test.tfvars

# Return to root
cd ../..
```

### Destroying Infrastructure

```bash
# Production (deletion_protection = true prevents database destruction)
terraform workspace select tamshai-production
terraform destroy -var-file=environments/production.tfvars
# Error: deletion_protection prevents destroy

# To destroy production (use with extreme caution):
# 1. Manually disable deletion_protection in production.tfvars or GCP Console
# 2. Run destroy again
terraform destroy -var-file=environments/production.tfvars

# For staging VPS destruction:
cd infrastructure/terraform/vps
terraform destroy
```

---

## Testing Guidelines

### 1. Syntax Validation

```bash
# Validate all modules
terraform init
terraform validate

# Expected output:
# Success! The configuration is valid.
```

### 2. Plan Review

```bash
# Always run plan before apply (production example)
terraform plan -var-file=environments/production.tfvars -out=plan.tfplan

# Review planned changes carefully:
# - Resources to be created (+)
# - Resources to be modified (~)
# - Resources to be destroyed (-)

# Apply saved plan
terraform apply plan.tfplan
```

### 3. Security Scanning

```bash
# Run tfsec (already in CI/CD pipeline)
tfsec .

# Expected: PASSED 45 checks

# Run Checkov (if installed)
checkov -d .

# Expected: Checks for 100+ security issues
```

### 4. Module Testing

**Per-module validation:**

```bash
# Networking
cd modules/networking && terraform init && terraform validate && cd ../..

# Security
cd modules/security && terraform init && terraform validate && cd ../..

# Database
cd modules/database && terraform init && terraform validate && cd ../..

# Storage
cd modules/storage && terraform init && terraform validate && cd ../..

# Compute
cd modules/compute && terraform init && terraform validate && cd ../..
```

### 5. Integration Testing

**Note**: For integration testing, use the VPS staging environment or local Docker Compose. GCP production should not be used for testing.

```bash
# Test with VPS staging
cd infrastructure/terraform/vps
terraform apply -auto-approve

# Verify services (staging uses domain-based access)
curl https://staging.tamshai.com/auth/health
curl https://staging.tamshai.com/api/health

# Or test locally with Docker Compose
cd infrastructure/docker
docker compose up -d
curl http://localhost:8180/health
curl http://localhost:3100/health
```

### 6. Drift Detection

```bash
# Check for infrastructure drift (manual changes outside Terraform)
terraform plan -var-file=environments/production.tfvars -detailed-exitcode

# Exit codes:
# 0 = No changes (no drift)
# 1 = Error
# 2 = Changes detected (drift found)

# Schedule in CI/CD:
# - Run nightly
# - Alert on exit code 2
# - Review drift and import/reconcile
```

---

## Migration Guide

### Migrating from Monolithic to Modular (GCP Production)

**Original State:**
- Single `main.tf` (831 lines)
- Hardcoded values
- No reusable components

**New State:**
- 5 focused GCP modules
- Production-specific tfvars
- Reusable and testable

**Migration Steps:**

1. **Backup existing state:**
   ```bash
   terraform state pull > state-backup.json
   cp main.tf main.tf.backup-monolithic
   ```

2. **Plan with new modules:**
   ```bash
   terraform init -upgrade
   terraform workspace select tamshai-production
   terraform plan -var-file=environments/production.tfvars
   ```

3. **Review plan output:**
   - **Expected**: Resources will be recreated (destroy + create)
   - **Reason**: Resource names have changed (e.g., `google_compute_network.vpc` → `module.networking.google_compute_network.vpc`)

4. **State migration (optional, advanced):**
   ```bash
   # Move resources to new module paths to avoid recreation
   terraform state mv google_compute_network.vpc module.networking.google_compute_network.vpc
   terraform state mv google_compute_subnetwork.subnet module.networking.google_compute_subnetwork.subnet
   # ... repeat for all resources
   ```

5. **Apply changes:**
   ```bash
   terraform apply -var-file=environments/production.tfvars
   ```

**Note**: For production, consider creating a new GCP project and migrating data rather than state manipulation. The modular structure is designed for greenfield deployments.

---

## Best Practices

### 1. Module Design

- **Single Responsibility**: Each module manages one domain (networking, security, etc.)
- **Clear Interfaces**: Well-defined inputs (variables) and outputs
- **Minimal Dependencies**: Modules should be as independent as possible
- **Versioning**: Tag module releases (e.g., `v1.0.0`) for stability

### 2. Variable Management

- **Required Variables**: No defaults for critical values (e.g., `project_id`)
- **Sensible Defaults**: Provide defaults for non-critical values
- **Type Constraints**: Use `type` to enforce variable types
- **Validation**: Use `validation` blocks for complex constraints

**Example:**
```hcl
variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}
```

### 3. Secrets Management

- **Never commit secrets to Git**: Use `.gitignore` for `*.tfvars` if they contain secrets
- **Use Secret Manager**: Store all sensitive values in GCP Secret Manager
- **Fetch at runtime**: Startup scripts should fetch secrets, not receive them as metadata
- **Mark outputs as sensitive**: Prevents accidental console display

### 4. State Management

- **Use Terraform Cloud**: Encrypted remote state with locking
- **Separate workspaces**: One per environment (dev, staging, production)
- **State file security**: Never commit `.tfstate` files to Git
- **Regular backups**: Terraform Cloud provides automatic backups

### 5. Environment Isolation

- **Separate GCP projects** (optional but recommended):
  - `tamshai-dev` project
  - `tamshai-staging` project
  - `tamshai-production` project
- **Separate Terraform Cloud workspaces** (minimum):
  - `tamshai-dev` workspace
  - `tamshai-staging` workspace
  - `tamshai-production` workspace
- **Environment-specific tfvars**: Different configurations per environment

### 6. Change Management

- **Always run plan first**: Review changes before applying
- **Use `-out=plan.tfplan`**: Save plans for auditing
- **Apply saved plans**: Ensures plan and apply match
- **Document changes**: Commit messages should explain "why," not just "what"

### 7. Security

- **Run tfsec**: Automated security scanning in CI/CD
- **Enable deletion protection**: Production databases should have `deletion_protection = true`
- **Use private networking**: Databases should only have private IPs
- **Apply least privilege**: Service accounts should have minimal permissions
- **Enable audit logging**: All GCP resources should log to Cloud Logging

---

## Troubleshooting

### Common Issues

**1. Module Not Found**

```bash
Error: Module not found: ./modules/networking
```

**Solution**: Run `terraform init` to download modules.

---

**2. State Lock Errors**

```bash
Error: Error acquiring the state lock
```

**Solution**:
- Another `terraform` command is running (wait for completion)
- Previous command crashed (force unlock):
  ```bash
  terraform force-unlock <LOCK_ID>
  ```

---

**3. Dependency Errors**

```bash
Error: Missing required argument: network_id
```

**Solution**: Ensure dependent modules are defined before modules that use their outputs:
```hcl
module "networking" { ... }  # Define first
module "database" {
  network_id = module.networking.network_self_link  # Use second
}
```

---

**4. Deletion Protection**

```bash
Error: deletion_protection is enabled
```

**Solution** (production only, use with caution):
1. Update `production.tfvars`: Set environment-specific override
2. Apply change to disable protection
3. Destroy resource
4. Re-enable protection

---

**5. Secret Not Found**

```bash
Error: Error reading Secret Manager secret version
```

**Solution**:
- Verify secret exists: `gcloud secrets list`
- Check secret has at least one version: `gcloud secrets versions list <secret-id>`
- Ensure service account has `roles/secretmanager.secretAccessor` permission

---

## Cost Optimization

### Deployment Costs by Environment

| Environment | Platform | Monthly Cost | Key Cost Drivers |
|-------------|----------|--------------|------------------|
| Development | Docker Compose (Local) | $0 | Local resources only |
| Staging | VPS (DigitalOcean/Hetzner) | $40-60 | Single 4vCPU/8GB VPS |
| Production | GCP (these modules) | $150-200 | HA database, multiple GCE instances, Cloud Storage |

### GCP Production Cost Breakdown

**Production (~$150-200/month):**
- Cloud SQL (db-custom-2-7680, HA): ~$80/month
- Compute Engine (2x e2-standard): ~$50/month
- Cloud Storage (versioned, 7-year retention): ~$10/month
- Cloud NAT + Networking (egress): ~$15/month
- Secret Manager: ~$1/month

### Cost Reduction Strategies (GCP Production)

**Immediate Savings:**
- Committed Use Discounts (1-year or 3-year contracts) - Save 37-57%
- Sustained Use Discounts (automatic for resources running >25% of month)
- Rightsizing (monitor utilization, downsize if underutilized)
- Cloud CDN for static assets (reduce egress costs)

**Long-term Optimization:**
- Use Cloud Scheduler to stop/start non-critical instances during off-hours
- Implement Cloud Functions for serverless workloads (if applicable)
- Review and optimize Cloud Storage lifecycle policies
- Use Regional (not Multi-regional) for lower costs

**Monitoring:**
- Use GCP Cost Management tools
- Set budget alerts
- Review monthly cost reports
- Identify unused resources

---

## Future Enhancements

### Phase 2: Multi-Environment Isolation (Planned)

- Separate GCP projects per environment
- Cross-project IAM bindings
- Shared VPC for centralized networking

### Phase 3: Advanced IaC Scanning (Planned)

- Integrate Checkov for comprehensive policy checks
- Custom policies for organization-specific rules
- Automated remediation for common issues

### Phase 4: Drift Detection (Planned)

- Nightly `terraform plan` runs
- Slack/email alerts on drift
- Automated drift reconciliation for specific resource types

### Phase 5: Module Registry (Future)

- Publish internal modules to Terraform Cloud Private Registry
- Version modules independently
- Share modules across teams/projects

---

## References

- **Terraform Documentation**: https://www.terraform.io/docs
- **Google Cloud Provider**: https://registry.terraform.io/providers/hashicorp/google/latest/docs
- **Terraform Cloud**: https://app.terraform.io/
- **tfsec**: https://github.com/aquasecurity/tfsec
- **Checkov**: https://github.com/bridgecrewio/checkov
- **IaC Best Practices**: See `IaaC-Best-Practices.md`

---

*Last Updated: December 29, 2025*
*Architecture Version: 1.4*
*Document Version: 1.0*
