# Tamshai Enterprise AI - Single VPS Deployment
# Terraform configuration for automated VPS provisioning
#
# Supports: DigitalOcean, Hetzner, Linode (easily extensible)
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
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
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

variable "cloud_provider" {
  description = "Cloud provider to use: digitalocean, hetzner"
  type        = string
  default     = "digitalocean"

  validation {
    condition     = contains(["digitalocean", "hetzner"], var.cloud_provider)
    error_message = "Cloud provider must be 'digitalocean' or 'hetzner'."
  }
}

variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "region" {
  description = "Region for VPS deployment"
  type        = string
  default     = "nyc1" # DigitalOcean NYC or Hetzner nbg1
}

variable "vps_size" {
  description = "VPS size (RAM)"
  type        = string
  default     = "s-4vcpu-8gb" # DigitalOcean slug or Hetzner type
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

variable "claude_api_key" {
  description = "Anthropic Claude API key"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository URL for deployment"
  type        = string
  default     = "https://github.com/jcornell3/tamshai-enterprise-ai.git"
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

# =============================================================================
# PROVIDERS
# =============================================================================

provider "digitalocean" {
  token = var.do_token
}

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
  length  = 20
  special = true
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

# =============================================================================
# SSH KEY (for emergency access only)
# =============================================================================

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
# DIGITALOCEAN RESOURCES
# =============================================================================

resource "digitalocean_ssh_key" "deploy" {
  count      = var.cloud_provider == "digitalocean" ? 1 : 0
  name       = "tamshai-${var.environment}-deploy"
  public_key = tls_private_key.deploy_key.public_key_openssh
}

resource "digitalocean_droplet" "tamshai" {
  count  = var.cloud_provider == "digitalocean" ? 1 : 0
  name   = "tamshai-${var.environment}"
  region = var.region
  size   = var.vps_size
  image  = "ubuntu-24-04-x64"

  ssh_keys = [digitalocean_ssh_key.deploy[0].fingerprint]

  user_data = local.cloud_init_config

  tags = ["tamshai", var.environment]

  # Enable monitoring
  monitoring = true

  # Enable backups for production
  backups = var.environment == "prod"
}

resource "digitalocean_firewall" "tamshai" {
  count = var.cloud_provider == "digitalocean" ? 1 : 0
  name  = "tamshai-${var.environment}-firewall"

  droplet_ids = [digitalocean_droplet.tamshai[0].id]

  # Allow HTTP (redirect to HTTPS)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow SSH only from specified IPs
  dynamic "inbound_rule" {
    for_each = length(var.allowed_ssh_ips) > 0 ? [1] : []
    content {
      protocol         = "tcp"
      port_range       = "22"
      source_addresses = var.allowed_ssh_ips
    }
  }

  # Allow all outbound
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# =============================================================================
# HETZNER RESOURCES
# =============================================================================

resource "hcloud_ssh_key" "deploy" {
  count      = var.cloud_provider == "hetzner" ? 1 : 0
  name       = "tamshai-${var.environment}-deploy"
  public_key = tls_private_key.deploy_key.public_key_openssh
}

resource "hcloud_server" "tamshai" {
  count       = var.cloud_provider == "hetzner" ? 1 : 0
  name        = "tamshai-${var.environment}"
  server_type = var.vps_size == "s-4vcpu-8gb" ? "cx31" : var.vps_size # Map DO sizes
  location    = var.region == "nyc1" ? "nbg1" : var.region
  image       = "ubuntu-24.04"

  ssh_keys = [hcloud_ssh_key.deploy[0].id]

  user_data = local.cloud_init_config

  labels = {
    environment = var.environment
    project     = "tamshai"
  }
}

resource "hcloud_firewall" "tamshai" {
  count = var.cloud_provider == "hetzner" ? 1 : 0
  name  = "tamshai-${var.environment}-firewall"

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
  count       = var.cloud_provider == "hetzner" ? 1 : 0
  firewall_id = hcloud_firewall.tamshai[0].id
  server_ids  = [hcloud_server.tamshai[0].id]
}

# =============================================================================
# CLOUD-INIT CONFIGURATION
# =============================================================================

locals {
  vps_ip = var.cloud_provider == "digitalocean" ? (
    length(digitalocean_droplet.tamshai) > 0 ? digitalocean_droplet.tamshai[0].ipv4_address : ""
    ) : (
    length(hcloud_server.tamshai) > 0 ? hcloud_server.tamshai[0].ipv4_address : ""
  )

  cloud_init_config = templatefile("${path.module}/cloud-init.yaml", {
    domain               = var.domain
    email                = var.email
    environment          = var.environment
    github_repo          = var.github_repo
    github_branch        = var.github_branch
    claude_api_key       = var.claude_api_key
    postgres_password    = random_password.postgres_password.result
    keycloak_admin_pass  = random_password.keycloak_admin_password.result
    keycloak_db_password = random_password.keycloak_db_password.result
    mongodb_password     = random_password.mongodb_password.result
    minio_password       = random_password.minio_password.result
    jwt_secret           = random_password.jwt_secret.result
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
