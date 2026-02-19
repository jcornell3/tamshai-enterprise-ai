# Tamshai Enterprise AI - Single VPS Deployment
# Terraform configuration for automated VPS provisioning
#
# Provider: Hetzner Cloud
# All services run on a single VPS with Docker Compose
#
# Usage:
#   cd infrastructure/terraform/vps
#   cp terraform.tfvars.example terraform.tfvars  # Edit with your values
#   terraform init
#   terraform plan
#   terraform apply
#
# Remote deployment (no SSH login required):
#   terraform apply                    # Initial deployment
#   ./scripts/deploy.sh               # Update containers
#   ./scripts/deploy.sh --build       # Rebuild and update

terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.0"
    }
  }
}

# =============================================================================
# VARIABLES
# =============================================================================

variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "region" {
  description = "Region for VPS deployment (Hetzner locations: nbg1, fsn1, hel1, ash, hil)"
  type        = string
  default     = "hil" # Hillsboro, Oregon
}

variable "vps_size" {
  description = "VPS size (Hetzner types: cx21, cx31, cx41, cpx31, etc.)"
  type        = string
  default     = "cpx31" # 4 vCPU, 8GB RAM
}

variable "domain" {
  description = "Domain name for the application (e.g., tamshai.example.com)"
  type        = string
}

variable "email" {
  description = "Email for Let's Encrypt certificates"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "staging"
}

variable "claude_api_key_stage" {
  description = "Anthropic Claude API key for Stage/VPS environment (separate from dev)"
  type        = string
  sensitive   = true
}

variable "gemini_api_key_stage" {
  description = "Google Gemini API key for MCP Journey embeddings (Stage/VPS)"
  type        = string
  sensitive   = true
  default     = "" # Optional - mcp-journey semantic search disabled if not set
}

variable "github_repo" {
  description = "GitHub repository (owner/repo format for gh CLI, or full URL for git clone)"
  type        = string
  default     = "jcornell3/tamshai-enterprise-ai"
}

variable "github_repo_url" {
  description = "Full GitHub repository URL for git clone operations"
  type        = string
  default     = "https://github.com/jcornell3/tamshai-enterprise-ai.git"
}

variable "auto_update_github_secrets" {
  description = "Automatically update GitHub secrets (VPS_SSH_KEY) after terraform apply. Requires gh CLI."
  type        = bool
  default     = true
}

variable "github_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key for emergency access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "allowed_ssh_ips" {
  description = "IP addresses allowed for SSH (empty = disabled)"
  type        = list(string)
  default     = [] # No SSH by default - fully automated
}

variable "mcp_gateway_client_secret" {
  description = "Client secret for MCP Gateway Keycloak client (from GitHub Secrets)"
  type        = string
  sensitive   = true
}

variable "mcp_hr_service_client_secret" {
  description = "Client secret for MCP HR Service (identity sync)"
  type        = string
  sensitive   = true
  default     = "" # If empty, a random secret will be generated
}

variable "stage_user_password" {
  description = "Fixed password for synced users in stage/dev (leave empty for production)"
  type        = string
  sensitive   = true
  default     = "" # Empty = use random password (production)
}

variable "test_user_password" {
  description = "Password for test-user.journey E2E account (fetched from GitHub Secrets)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "test_user_totp_secret_raw" {
  description = "TOTP secret for test-user.journey in raw format (fetched from GitHub Secrets)"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# PROVIDERS
# =============================================================================

provider "hcloud" {
  token = var.hcloud_token
}

# =============================================================================
# GITHUB SECRETS (Phoenix Architecture)
# =============================================================================
# Fetch test user credentials from GitHub Secrets at apply time.
# This ensures terraform apply brings up a fully functional environment
# with correct E2E test credentials.
#
# Input: { "environment": "stage" }
# Output: { "user_password", "test_user_password", "test_user_totp_secret_raw" }
#
# =============================================================================

data "external" "github_secrets" {
  program = ["powershell", "-ExecutionPolicy", "Bypass", "-File", "${path.module}/scripts/fetch-github-secrets.ps1"]

  query = {
    environment = "stage"
  }
}

# =============================================================================
# GENERATED SECRETS
# =============================================================================

resource "random_password" "postgres_password" {
  length  = 24
  special = true
}

# NOTE: tamshai_app_password comes from GitHub Secrets (STAGE_TAMSHAI_APP_PASSWORD)
# This user has NO BYPASSRLS - used by MCP servers to enforce RLS policies
# The main 'tamshai' user has BYPASSRLS for identity-sync

resource "random_password" "keycloak_admin_password" {
  length  = 24
  special = true
}

resource "random_password" "keycloak_db_password" {
  length  = 24
  special = true
}

# URL-safe special characters only (no @:/?# which break URL parsing)
# Password is embedded in MONGODB_URI as mongodb://user:PASSWORD@host:port
resource "random_password" "mongodb_password" {
  length           = 24
  special          = true
  override_special = "!$%^&*()-_=+|~"
}

resource "random_password" "minio_password" {
  length  = 24
  special = true
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "random_password" "mcp_hr_service_secret" {
  length  = 32
  special = true
}

resource "random_password" "redis_password" {
  length  = 24
  special = true
}

# URL-safe special characters only (no @:/?# which break URL parsing)
# Password is embedded in ELASTICSEARCH_URL as http://elastic:PASSWORD@host:port
resource "random_password" "elastic_password" {
  length           = 24
  special          = true
  override_special = "!$%^&*()-_=+|~"
}

resource "random_password" "vault_dev_root_token" {
  length  = 24
  special = true
}

resource "random_password" "mcp_internal_secret" {
  length  = 32
  special = true
}

resource "random_password" "mcp_ui_client_secret" {
  length  = 32
  special = true
}

resource "random_password" "e2e_admin_api_key" {
  length  = 32
  special = true
}

# SECURITY: Root password stored in encrypted Terraform Cloud state.
# Only used for emergency console access. SSH key auth preferred.
#checkov:skip=CKV_SECRET_6:Password stored in encrypted Terraform Cloud state. Access restricted via workspace RBAC.
resource "random_password" "root_password" {
  length  = 20
  special = true
  upper   = true
  lower   = true
  numeric = true
}

# =============================================================================
# SSH KEY (for emergency access only)
# =============================================================================

# SECURITY: This private key is stored in Terraform state.
# Ensure Terraform Cloud workspace has encryption enabled.
# State access should be restricted via RBAC.
#checkov:skip=CKV_SECRET_6:Private key stored in encrypted Terraform Cloud state. Access restricted via workspace RBAC.
resource "tls_private_key" "deploy_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Save deploy key locally for emergency access
resource "local_sensitive_file" "deploy_private_key" {
  content         = tls_private_key.deploy_key.private_key_pem
  filename        = "${path.module}/.keys/deploy_key"
  file_permission = "0600"
}

resource "local_file" "deploy_public_key" {
  content  = tls_private_key.deploy_key.public_key_openssh
  filename = "${path.module}/.keys/deploy_key.pub"
}

# =============================================================================
# GITHUB SECRETS AUTOMATION
# =============================================================================
# Automatically updates GitHub Actions secret with the SSH key
# Requires: gh CLI installed and authenticated (gh auth login)

resource "null_resource" "update_github_ssh_secret" {
  count = var.auto_update_github_secrets ? 1 : 0

  triggers = {
    # Re-run when the SSH key changes
    ssh_key_fingerprint = tls_private_key.deploy_key.public_key_fingerprint_sha256
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Updating GitHub secret VPS_SSH_KEY..."
      gh secret set VPS_SSH_KEY --repo "${var.github_repo}" < "${local_sensitive_file.deploy_private_key.filename}"
      echo "GitHub secret updated successfully"
    EOT

    interpreter = ["bash", "-c"]
  }

  depends_on = [local_sensitive_file.deploy_private_key]
}

# Auto-update KEYCLOAK_VPS_ADMIN_PASSWORD when it changes (Phoenix compliance)
resource "null_resource" "update_github_keycloak_secret" {
  count = var.auto_update_github_secrets ? 1 : 0

  triggers = {
    # Re-run when the Keycloak admin password changes
    keycloak_password_hash = sha256(random_password.keycloak_admin_password.result)
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Updating GitHub secret KEYCLOAK_VPS_ADMIN_PASSWORD..."
      echo "${random_password.keycloak_admin_password.result}" | gh secret set KEYCLOAK_VPS_ADMIN_PASSWORD --repo "${var.github_repo}"
      echo "GitHub secret updated successfully"
    EOT

    interpreter = ["bash", "-c"]
  }

  depends_on = [random_password.keycloak_admin_password]
}

# Auto-update additional GitHub secrets so deploy-vps.yml has matching values
resource "null_resource" "update_github_stage_secrets" {
  count = var.auto_update_github_secrets ? 1 : 0

  triggers = {
    redis_hash   = sha256(random_password.redis_password.result)
    elastic_hash = sha256(random_password.elastic_password.result)
    vault_hash   = sha256(random_password.vault_dev_root_token.result)
    mcp_int_hash = sha256(random_password.mcp_internal_secret.result)
    mcp_ui_hash  = sha256(random_password.mcp_ui_client_secret.result)
    e2e_api_hash = sha256(random_password.e2e_admin_api_key.result)
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Updating GitHub stage secrets..."
      echo "${random_password.redis_password.result}" | gh secret set STAGE_REDIS_PASSWORD --repo "${var.github_repo}"
      echo "${random_password.elastic_password.result}" | gh secret set ELASTIC_PASSWORD --repo "${var.github_repo}"
      echo "${random_password.vault_dev_root_token.result}" | gh secret set VAULT_DEV_ROOT_TOKEN_ID --repo "${var.github_repo}"
      echo "${random_password.mcp_internal_secret.result}" | gh secret set MCP_INTERNAL_SECRET --repo "${var.github_repo}"
      echo "${random_password.mcp_ui_client_secret.result}" | gh secret set MCP_UI_CLIENT_SECRET --repo "${var.github_repo}"
      echo "${random_password.e2e_admin_api_key.result}" | gh secret set E2E_ADMIN_API_KEY --repo "${var.github_repo}"
      echo "GitHub stage secrets updated successfully"
    EOT

    interpreter = ["bash", "-c"]
  }

  depends_on = [
    random_password.redis_password,
    random_password.elastic_password,
    random_password.vault_dev_root_token,
    random_password.mcp_internal_secret,
    random_password.mcp_ui_client_secret,
    random_password.e2e_admin_api_key,
  ]
}

# =============================================================================
# DATA SOURCES - Validate external resources exist before use
# =============================================================================

# Validate the Ubuntu image exists in Hetzner Cloud before provisioning.
# This catches typos or deprecated image names at plan time rather than apply time.
data "hcloud_image" "ubuntu" {
  name              = "ubuntu-24.04"
  with_architecture = "x86"
  most_recent       = true
}

# =============================================================================
# HETZNER RESOURCES
# =============================================================================

resource "hcloud_ssh_key" "deploy" {
  name       = "tamshai-${var.environment}-deploy"
  public_key = tls_private_key.deploy_key.public_key_openssh
}

#checkov:skip=CKV_HETZNER_2:Hetzner Cloud provides disk encryption at platform level by default. Explicit customer-managed encryption not required for this use case.
resource "hcloud_server" "tamshai" {
  name        = "tamshai-${var.environment}"
  server_type = var.vps_size
  location    = var.region
  image       = data.hcloud_image.ubuntu.id

  ssh_keys = [hcloud_ssh_key.deploy.id]

  user_data = local.cloud_init_config

  labels = {
    environment = var.environment
    project     = "tamshai"
  }
}

#checkov:skip=CKV_HETZNER_1:Public web server requires open HTTP/HTTPS (0.0.0.0/0). Defense-in-depth: (1) SSH restricted to allowed_ssh_ips, (2) fail2ban blocks brute-force attempts (3 failed SSH attempts), (3) Caddy enforces HTTPS redirect and handles TLS termination.
resource "hcloud_firewall" "tamshai" {
  name = "tamshai-${var.environment}-firewall"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SECURITY: Vault port 8200 is NOT exposed to the public internet.
  # Access Vault via SSH tunnel instead. See docs/security/VAULT_ACCESS.md
  #
  # Previous configuration exposed 8200 to 0.0.0.0/0 which was a security risk.
  # All GitHub Actions workflows access Vault through SSH tunneling:
  #   ssh root@vps "VAULT_ADDR='https://127.0.0.1:8200' vault status"

  dynamic "rule" {
    for_each = length(var.allowed_ssh_ips) > 0 ? [1] : []
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = "22"
      source_ips = var.allowed_ssh_ips
    }
  }
}

resource "hcloud_firewall_attachment" "tamshai" {
  firewall_id = hcloud_firewall.tamshai.id
  server_ids  = [hcloud_server.tamshai.id]
}

# =============================================================================
# CLOUD-INIT CONFIGURATION
# =============================================================================

locals {
  vps_ip = hcloud_server.tamshai.ipv4_address

  # Use provided secret or generate one
  mcp_hr_service_secret = var.mcp_hr_service_client_secret != "" ? var.mcp_hr_service_client_secret : random_password.mcp_hr_service_secret.result

  # Phoenix Architecture: Test credentials ALWAYS come from GitHub Secrets
  # This ensures terraform apply produces a consistent, testable environment
  # Do NOT use coalesce with variables - that allows env vars to override
  test_user_password        = data.external.github_secrets.result.test_user_password
  test_user_totp_secret_raw = data.external.github_secrets.result.test_user_totp_secret_raw

  # Stage user password (corporate users) from GitHub Secrets
  # Falls back to variable only if external data returns empty (shouldn't happen)
  stage_user_password_resolved = coalesce(
    data.external.github_secrets.result.user_password,
    var.stage_user_password,
    ""
  )

  # Fetch tamshai_app_password from GitHub Secrets (required for RLS enforcement)
  tamshai_app_password = data.external.github_secrets.result.tamshai_app_password

  cloud_init_config = templatefile("${path.module}/cloud-init.yaml", {
    domain                       = var.domain
    email                        = var.email
    environment                  = var.environment
    github_repo                  = var.github_repo_url
    github_branch                = var.github_branch
    claude_api_key               = replace(var.claude_api_key_stage, "$", "$$") # User-provided, may have special chars
    gemini_api_key               = replace(var.gemini_api_key_stage, "$", "$$") # User-provided, may have special chars
    postgres_password            = base64encode(random_password.postgres_password.result)
    tamshai_app_password         = base64encode(local.tamshai_app_password)
    keycloak_admin_pass          = base64encode(random_password.keycloak_admin_password.result)
    keycloak_db_password         = base64encode(random_password.keycloak_db_password.result)
    mongodb_password             = base64encode(random_password.mongodb_password.result)
    minio_password               = base64encode(random_password.minio_password.result)
    jwt_secret                   = base64encode(random_password.jwt_secret.result)
    root_password                = base64encode(random_password.root_password.result)
    mcp_gateway_client_secret    = base64encode(var.mcp_gateway_client_secret)
    mcp_hr_service_client_secret = base64encode(local.mcp_hr_service_secret)
    stage_user_password          = base64encode(local.stage_user_password_resolved)
    test_user_password           = base64encode(local.test_user_password)
    test_user_totp_secret_raw    = base64encode(local.test_user_totp_secret_raw)
    redis_password               = base64encode(random_password.redis_password.result)
    elastic_password             = base64encode(random_password.elastic_password.result)
    vault_dev_root_token         = base64encode(random_password.vault_dev_root_token.result)
    mcp_internal_secret          = base64encode(random_password.mcp_internal_secret.result)
    mcp_ui_client_secret         = base64encode(random_password.mcp_ui_client_secret.result)
    e2e_admin_api_key            = base64encode(random_password.e2e_admin_api_key.result)
    # C2 Security: Encryption salt for secrets at rest
    encryption_salt              = random_password.encryption_salt.result
  })
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "vps_ip" {
  description = "VPS public IP address"
  value       = local.vps_ip
}

output "app_url" {
  description = "Application URL"
  value       = "https://${var.domain}"
}

output "keycloak_url" {
  description = "Keycloak admin URL"
  value       = "https://${var.domain}/auth"
}

output "api_url" {
  description = "MCP Gateway API URL"
  value       = "https://${var.domain}/api"
}

output "keycloak_admin_password" {
  description = "Keycloak admin password"
  value       = random_password.keycloak_admin_password.result
  sensitive   = true
}

output "root_password" {
  description = "VPS root password for console access"
  value       = random_password.root_password.result
  sensitive   = true
}

output "mcp_gateway_client_secret" {
  description = "MCP Gateway Keycloak client secret (from GitHub Secrets, not auto-generated)"
  value       = var.mcp_gateway_client_secret
  sensitive   = true
}

output "deploy_command" {
  description = "Command to deploy updates"
  value       = "./scripts/deploy.sh"
}

output "emergency_ssh" {
  description = "Emergency SSH command (if SSH enabled)"
  value       = length(var.allowed_ssh_ips) > 0 ? "ssh -i ${path.module}/.keys/deploy_key root@${local.vps_ip}" : "SSH disabled - use cloud console"
}

output "dns_records" {
  description = "DNS records to create"
  value       = <<-EOT
    Create this DNS record pointing to ${local.vps_ip}:

    Type  Name              Value
    A     ${var.domain}     ${local.vps_ip}

    All services are path-based (no subdomains required):
    - ${var.domain}/        Main portal
    - ${var.domain}/auth    Keycloak
    - ${var.domain}/api     MCP Gateway
    - ${var.domain}/hr      HR App
    - ${var.domain}/finance Finance App
    - ${var.domain}/sales   Sales App
    - ${var.domain}/support Support App
  EOT
}
