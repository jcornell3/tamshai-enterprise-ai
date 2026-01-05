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

variable "mcp_hr_service_client_secret" {
  description = "Client secret for MCP HR Service (identity sync)"
  type        = string
  sensitive   = true
  default     = "" # If empty, a random secret will be generated
}

variable "stage_testing_password" {
  description = "Fixed password for identity sync in stage/dev (leave empty for production)"
  type        = string
  sensitive   = true
  default     = "" # Empty = use random password (production)
}

# =============================================================================
# PROVIDERS
# =============================================================================

provider "hcloud" {
  token = var.hcloud_token
}

# =============================================================================
# GENERATED SECRETS
# =============================================================================

resource "random_password" "postgres_password" {
  length  = 24
  special = false
}

resource "random_password" "keycloak_admin_password" {
  length  = 24
  special = false # Avoid shell/docker-compose expansion issues with $, (, ), etc.
}

resource "random_password" "keycloak_db_password" {
  length  = 24
  special = false
}

resource "random_password" "mongodb_password" {
  length  = 24
  special = false
}

resource "random_password" "minio_password" {
  length  = 24
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "mcp_hr_service_secret" {
  length  = 32
  special = false
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
  image       = "ubuntu-24.04"

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

  # Vault HTTPS API - required for GitHub Actions OIDC authentication
  # before SSH certificates can be obtained
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "8200"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

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

  cloud_init_config = templatefile("${path.module}/cloud-init.yaml", {
    domain                       = var.domain
    email                        = var.email
    environment                  = var.environment
    github_repo                  = var.github_repo_url
    github_branch                = var.github_branch
    claude_api_key               = replace(var.claude_api_key_stage, "$", "$$") # User-provided, may have special chars
    postgres_password            = random_password.postgres_password.result
    keycloak_admin_pass          = random_password.keycloak_admin_password.result
    keycloak_db_password         = random_password.keycloak_db_password.result
    mongodb_password             = random_password.mongodb_password.result
    minio_password               = random_password.minio_password.result
    jwt_secret                   = random_password.jwt_secret.result
    root_password                = random_password.root_password.result
    mcp_hr_service_client_secret = local.mcp_hr_service_secret
    stage_testing_password       = var.stage_testing_password
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
