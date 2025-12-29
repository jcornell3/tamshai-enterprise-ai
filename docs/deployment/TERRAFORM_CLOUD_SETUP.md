# Terraform Cloud Setup Guide for Tamshai on Hetzner

Complete guide to setting up Terraform Cloud for secure state management.

## Table of Contents
1. [Why Terraform Cloud](#why-terraform-cloud)
2. [Account Setup](#account-setup)
3. [Organization & Workspace](#organization--workspace)
4. [Local Configuration](#local-configuration)
5. [State Migration](#state-migration)
6. [GitHub Integration](#github-integration)
7. [Secrets Management](#secrets-management)
8. [Team Access](#team-access)

## Why Terraform Cloud

**Free Tier Includes:**
- ✅ Encrypted state storage (AES-256)
- ✅ State locking (prevents concurrent modifications)
- ✅ State versioning (rollback capability)
- ✅ Up to 500 resources managed
- ✅ Up to 5 users
- ✅ Private module registry
- ✅ Sentinel policy as code (limited)
- ✅ Cost estimation

**vs GitHub Repository:**
- ❌ GitHub: State files contain plaintext secrets
- ❌ GitHub: No state locking (corruption risk)
- ❌ GitHub: Secrets in Git history forever
- ✅ Terraform Cloud: Encrypted, locked, versioned

**vs AWS S3:**
- ❌ S3: Requires AWS account
- ❌ S3: Monthly costs (~$5)
- ❌ S3: Additional DynamoDB table for locking
- ✅ Terraform Cloud: Free, simpler, purpose-built

## Account Setup

### Step 1: Create Account

1. Go to: https://app.terraform.io/signup/account
2. Sign up with:
   - **Email**: your-email@tamshai.com
   - **Password**: (use strong password)
   - Or use **GitHub OAuth** for SSO

3. Verify your email address

### Step 2: Create Organization

1. After login, click "Create Organization"
2. Settings:
   - **Organization name**: `tamshai` (or `tamshai-ai`)
   - **Email**: your-email@tamshai.com
   - Click "Create organization"

**Organization Naming:**
- Must be unique across all Terraform Cloud
- Use lowercase, hyphens allowed
- Cannot be changed later
- Recommendation: `tamshai` or `tamshai-enterprise`

### Step 3: Create API Token

1. Click your avatar → "User Settings"
2. Go to "Tokens" section
3. Click "Create an API token"
4. Settings:
   - **Description**: `GitHub Actions CI/CD`
   - **Expiration**: 90 days (or custom)
5. Click "Generate token"
6. **IMPORTANT**: Copy token immediately (shown only once)
7. Save to password manager

**Token Format:**
```
qwerty1234567890abcdefghijklmnopqrstuvwxyz.atlasv1.1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz
```

## Organization & Workspace

### Step 1: Create Workspace

1. In your organization, click "New workspace"
2. Choose workflow:
   - Select "CLI-driven workflow" (recommended for GitHub Actions)
3. Workspace settings:
   - **Workspace name**: `tamshai-production`
   - **Project**: Default Project (or create new)
   - **Description**: Production infrastructure on Hetzner VPS
4. Click "Create workspace"

**Workspace Naming Convention:**
```
tamshai-production     # Production environment
tamshai-staging        # Staging environment
tamshai-development    # Development environment
```

### Step 2: Configure Workspace

Navigate to workspace → Settings

**General Settings:**
- **Terraform Version**: Latest (auto-upgrade: ON)
- **Execution Mode**: Remote (recommended) or Local
- **Apply Method**: Manual apply (require approval)
- **Auto-apply**: OFF (safer for production)

**Remote State Sharing:**
- Go to "General" settings
- Find "Remote state sharing"
- Share with: (leave empty for now, add other workspaces if needed)

**Notifications:**
- Go to "Notifications"
- Add Slack/Email notifications for:
  - Run states (success/failure)
  - Apply confirmations

## Local Configuration

### Step 1: Install Terraform CLI

```bash
# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# macOS
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# Windows
choco install terraform

# Verify
terraform --version
```

### Step 2: Login to Terraform Cloud

```bash
# Login via CLI
terraform login

# This will:
# 1. Open browser to https://app.terraform.io/app/settings/tokens
# 2. Generate a token
# 3. Store in ~/.terraform.d/credentials.tfrc.json

# Alternative: Manual token setup
# Create file: ~/.terraform.d/credentials.tfrc.json
{
  "credentials": {
    "app.terraform.io": {
      "token": "YOUR_API_TOKEN_HERE"
    }
  }
}
```

### Step 3: Update Terraform Configuration

Create or update your `terraform/main.tf`:

```hcl
# terraform/main.tf
terraform {
  required_version = ">= 1.6"

  # Terraform Cloud backend configuration
  cloud {
    organization = "tamshai"  # Your org name

    workspaces {
      name = "tamshai-production"  # Your workspace name
    }
  }

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

# Hetzner Cloud provider
provider "hcloud" {
  token = var.hetzner_token
}

# Variables
variable "hetzner_token" {
  description = "Hetzner Cloud API Token"
  type        = string
  sensitive   = true
}

variable "server_name" {
  description = "Name of the Hetzner server"
  type        = string
  default     = "tamshai-prod-01"
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cx22"  # 2 vCPU, 4GB RAM, 40GB SSD
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "nbg1"  # Nuremberg, Germany
}

variable "server_image" {
  description = "Server OS image"
  type        = string
  default     = "ubuntu-22.04"
}

# SSH Key
resource "hcloud_ssh_key" "default" {
  name       = "tamshai-deploy-key"
  public_key = file("~/.ssh/tamshai_rsa.pub")
}

# Firewall
resource "hcloud_firewall" "tamshai" {
  name = "tamshai-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
  }
}

# Server
resource "hcloud_server" "tamshai_prod" {
  name        = var.server_name
  server_type = var.server_type
  image       = var.server_image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.default.id]
  firewall_ids = [hcloud_firewall.tamshai.id]

  labels = {
    environment = "production"
    application = "tamshai-ai"
    managed_by  = "terraform"
  }

  user_data = file("${path.module}/cloud-init.yml")
}

# Outputs
output "server_ip" {
  description = "Public IP address of the server"
  value       = hcloud_server.tamshai_prod.ipv4_address
}

output "server_status" {
  description = "Server status"
  value       = hcloud_server.tamshai_prod.status
}
```

## State Migration

### Scenario 1: New Infrastructure (No Existing State)

```bash
cd terraform/

# Initialize with Terraform Cloud
terraform init

# Plan infrastructure
terraform plan

# Apply (will prompt for approval in Terraform Cloud UI)
terraform apply
```

### Scenario 2: Migrating from Local State

If you have existing `terraform.tfstate` file:

```bash
cd terraform/

# Backup existing state
cp terraform.tfstate terraform.tfstate.backup

# Update main.tf with cloud block (shown above)

# Initialize and migrate
terraform init -migrate-state

# You'll see:
# Terraform has detected that the configuration specified for the backend
# has changed. Terraform will now migrate the state from the previous
# backend to the newly configured backend.
#
# Do you want to copy existing state to the new backend?
# Enter "yes" to copy and "no" to start with an empty state.

# Type: yes

# Verify migration
terraform state list

# Old local state is now in Terraform Cloud
# Delete local state (optional, already backed up)
rm terraform.tfstate terraform.tfstate.backup
```

## GitHub Integration

### Step 1: Add API Token to GitHub Secrets

1. Go to GitHub repo: Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add secret:
   - **Name**: `TF_API_TOKEN`
   - **Value**: Your Terraform Cloud API token
4. Click "Add secret"

### Step 2: Set Workspace Variables

In Terraform Cloud workspace → Variables:

**Environment Variables:**
- `TF_LOG`: `INFO` (for debugging, optional)

**Terraform Variables:**
1. Click "Add variable" → "Terraform variable"
2. Add each:
   - **Key**: `hetzner_token`
   - **Value**: Your Hetzner API token
   - **Sensitive**: ✅ Checked
   - **Description**: Hetzner Cloud API token

## Secrets Management

### Sensitive Variables

All sensitive variables should be marked as such:

```hcl
variable "hetzner_token" {
  description = "Hetzner Cloud API Token"
  type        = string
  sensitive   = true  # Won't show in logs
}

variable "database_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}
```

### Where Secrets Live

**Never store in:**
- ❌ Git repository
- ❌ Terraform configuration files
- ❌ Local .tfvars files (if committed)

**Store in:**
- ✅ Terraform Cloud workspace variables (encrypted)
- ✅ GitHub Secrets (for CI/CD)
- ✅ HashiCorp Vault (Phase 2)

## Team Access

### Step 1: Invite Team Members

1. Organization Settings → Teams
2. Click "Create team"
3. Settings:
   - **Name**: `Developers`
   - **Visibility**: Visible
4. Click "Create team"

### Step 2: Add Members

1. Click team → "Team members"
2. Click "Add a member"
3. Enter email address
4. Member receives invitation

### Step 3: Configure Workspace Access

1. Workspace → Settings → Team Access
2. Click "Add team and permissions"
3. Select team: `Developers`
4. Permissions:
   - **Read**: View runs and state
   - **Plan**: Create plans
   - **Write**: Apply plans
   - **Admin**: Manage workspace settings

**Recommended Permission Structure:**
```
Owners:        Admin (full access)
DevOps Team:   Write (plan + apply)
Developers:    Plan (view + plan)
Stakeholders:  Read (view only)
```

## Troubleshooting

### Issue: "Error: No valid credential sources found"

**Solution:**
```bash
# Re-login to Terraform Cloud
terraform login

# Or check credentials file
cat ~/.terraform.d/credentials.tfrc.json

# Ensure token is valid (not expired)
```

### Issue: "Error: Workspace not found"

**Solution:**
```hcl
# Verify organization and workspace name match exactly
cloud {
  organization = "tamshai"  # Check spelling
  workspaces {
    name = "tamshai-production"  # Check spelling
  }
}
```

## Security Best Practices

### 1. Enable 2FA

1. User Settings → Password & Two-factor authentication
2. Click "Enable Two-factor authentication"
3. Scan QR code with authenticator app
4. Enter verification code
5. Save recovery codes securely

### 2. Rotate API Tokens

```bash
# Tokens should be rotated every 90 days
# 1. Create new token (UI)
# 2. Update GitHub Secrets
# 3. Update local credentials
# 4. Test new token
# 5. Delete old token
```

## Next Steps

- ✅ Set up Terraform Cloud
- ✅ Migrate state
- ✅ Configure workspace variables
- ✅ Integrate with GitHub Actions
- ⬜ Set up HashiCorp Vault (next guide)
- ⬜ Configure monitoring and alerts

## Resources

- [Terraform Cloud Documentation](https://developer.hashicorp.com/terraform/cloud-docs)
- [Hetzner Cloud Provider](https://registry.terraform.io/providers/hetznercloud/hcloud/latest/docs)
- [Terraform Cloud Pricing](https://www.hashicorp.com/products/terraform/pricing)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)
