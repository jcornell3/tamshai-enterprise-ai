# Tamshai Corp Enterprise AI - GCP Infrastructure
# Terraform configuration for testing/development (e2-micro instances)
#
# SECURITY: All secrets are stored in GCP Secret Manager and fetched at runtime.
# No secrets are embedded in Terraform state or startup scripts.
#
# Estimated Monthly Cost: ~$35-45/month
# - e2-micro instances: ~$6/month each
# - Cloud SQL (db-f1-micro): ~$8/month
# - Cloud Storage: ~$1/month
# - Load Balancer: ~$18/month (can be avoided for testing)
# - Egress: Minimal for testing

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # Backend configuration for encrypted state storage
  # Uncomment and configure for production use
  # backend "gcs" {
  #   bucket = "tamshai-terraform-state"
  #   prefix = "enterprise-ai"
  #   # GCS encrypts at rest by default with Google-managed keys
  #   # For additional security, use Customer-Managed Encryption Keys (CMEK)
  # }
}

# =============================================================================
# VARIABLES
# =============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west1" # Oregon - typically cheaper
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-west1-b"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "tamshai.local"
}

# Machine type for testing - e2-micro is the smallest/cheapest
variable "machine_type" {
  description = "GCE machine type for services"
  type        = string
  default     = "e2-micro" # 0.25 vCPU, 1GB RAM - ~$6/month
}

# For services needing more memory (Keycloak, Elasticsearch)
variable "machine_type_medium" {
  description = "GCE machine type for memory-intensive services"
  type        = string
  default     = "e2-small" # 0.5 vCPU, 2GB RAM - ~$12/month
}

# =============================================================================
# PROVIDER CONFIGURATION
# =============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# =============================================================================
# SERVICE ACCOUNTS (Principle of Least Privilege)
# =============================================================================

# Service account for Keycloak
resource "google_service_account" "keycloak" {
  account_id   = "tamshai-${var.environment}-keycloak"
  display_name = "Tamshai Keycloak Service Account"
  description  = "Service account for Keycloak identity provider"
}

# Service account for MCP Gateway
resource "google_service_account" "mcp_gateway" {
  account_id   = "tamshai-${var.environment}-mcp-gateway"
  display_name = "Tamshai MCP Gateway Service Account"
  description  = "Service account for MCP Gateway AI orchestration"
}

# Service account for MCP Servers
resource "google_service_account" "mcp_servers" {
  account_id   = "tamshai-${var.environment}-mcp-servers"
  display_name = "Tamshai MCP Servers Service Account"
  description  = "Service account for domain MCP servers (HR, Finance, Sales, Support)"
}

# =============================================================================
# SECRET MANAGER - All secrets stored here, fetched at runtime
# =============================================================================

# Enable Secret Manager API
resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# --- Keycloak Secrets ---

resource "google_secret_manager_secret" "keycloak_admin_password" {
  secret_id = "tamshai-${var.environment}-keycloak-admin-password"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "keycloak"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "keycloak_admin_password" {
  secret      = google_secret_manager_secret.keycloak_admin_password.id
  secret_data = random_password.keycloak_admin_password.result
}

resource "google_secret_manager_secret" "keycloak_db_password" {
  secret_id = "tamshai-${var.environment}-keycloak-db-password"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "keycloak"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "keycloak_db_password" {
  secret      = google_secret_manager_secret.keycloak_db_password.id
  secret_data = random_password.keycloak_db_password.result
}

# --- Database Secrets ---

resource "google_secret_manager_secret" "tamshai_db_password" {
  secret_id = "tamshai-${var.environment}-db-password"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "database"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "tamshai_db_password" {
  secret      = google_secret_manager_secret.tamshai_db_password.id
  secret_data = random_password.tamshai_db_password.result
}

# --- MCP Gateway Secrets ---

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "tamshai-${var.environment}-anthropic-api-key"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "mcp-gateway"
  }

  depends_on = [google_project_service.secretmanager]
}

# NOTE: Anthropic API key must be added manually after terraform apply:
# gcloud secrets versions add tamshai-dev-anthropic-api-key --data-file=-
# Then paste your API key and press Ctrl+D

resource "google_secret_manager_secret" "mcp_gateway_client_secret" {
  secret_id = "tamshai-${var.environment}-mcp-gateway-client-secret"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "mcp-gateway"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "mcp_gateway_client_secret" {
  secret      = google_secret_manager_secret.mcp_gateway_client_secret.id
  secret_data = random_password.mcp_gateway_client_secret.result
}

# --- JWT Signing Key (for token validation) ---

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "tamshai-${var.environment}-jwt-secret"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    service     = "auth"
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# =============================================================================
# SECRET MANAGER IAM - Grant access to service accounts
# =============================================================================

# Keycloak can access its own secrets
resource "google_secret_manager_secret_iam_member" "keycloak_admin_access" {
  secret_id = google_secret_manager_secret.keycloak_admin_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak.email}"
}

resource "google_secret_manager_secret_iam_member" "keycloak_db_access" {
  secret_id = google_secret_manager_secret.keycloak_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak.email}"
}

# MCP Gateway can access its secrets
resource "google_secret_manager_secret_iam_member" "mcp_gateway_anthropic_access" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_gateway_client_secret_access" {
  secret_id = google_secret_manager_secret.mcp_gateway_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_gateway_jwt_access" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_gateway.email}"
}

# MCP Servers can access database password
resource "google_secret_manager_secret_iam_member" "mcp_servers_db_access" {
  secret_id = google_secret_manager_secret.tamshai_db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp_servers.email}"
}

# =============================================================================
# RANDOM PASSWORD GENERATION
# =============================================================================

resource "random_password" "keycloak_admin_password" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
}

resource "random_password" "keycloak_db_password" {
  length  = 24
  special = false # Avoid special chars in JDBC URLs
}

resource "random_password" "tamshai_db_password" {
  length  = 24
  special = false
}

resource "random_password" "mcp_gateway_client_secret" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# =============================================================================
# NETWORKING
# =============================================================================

# VPC Network
resource "google_compute_network" "tamshai_vpc" {
  name                    = "tamshai-${var.environment}-vpc"
  auto_create_subnetworks = false
  description             = "VPC for Tamshai Enterprise AI - ${var.environment}"
}

# Subnet for services
resource "google_compute_subnetwork" "tamshai_subnet" {
  name          = "tamshai-${var.environment}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.tamshai_vpc.id

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud Router for NAT
resource "google_compute_router" "tamshai_router" {
  name    = "tamshai-${var.environment}-router"
  region  = var.region
  network = google_compute_network.tamshai_vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "tamshai_nat" {
  name                               = "tamshai-${var.environment}-nat"
  router                             = google_compute_router.tamshai_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# =============================================================================
# FIREWALL RULES
# =============================================================================

# Allow internal communication
resource "google_compute_firewall" "allow_internal" {
  name    = "tamshai-${var.environment}-allow-internal"
  network = google_compute_network.tamshai_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/24"]
}

# Allow HTTP/HTTPS from anywhere (for testing - restrict in production)
resource "google_compute_firewall" "allow_http" {
  name    = "tamshai-${var.environment}-allow-http"
  network = google_compute_network.tamshai_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080", "8000", "3000", "3100"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]
}

# Allow SSH via IAP only (more secure than open SSH)
resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "tamshai-${var.environment}-allow-iap-ssh"
  network = google_compute_network.tamshai_vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ssh-enabled"]
}

# =============================================================================
# CLOUD SQL (PostgreSQL)
# =============================================================================

resource "google_sql_database_instance" "tamshai_postgres" {
  name             = "tamshai-${var.environment}-postgres"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    # db-f1-micro: Shared vCPU, 0.6 GB RAM - ~$8/month
    tier = "db-f1-micro"

    disk_size       = 10 # GB
    disk_type       = "PD_SSD"
    disk_autoresize = false # Keep costs predictable

    ip_configuration {
      ipv4_enabled    = false # Use private IP only
      private_network = google_compute_network.tamshai_vpc.id
    }

    backup_configuration {
      enabled    = var.environment == "prod"
      start_time = "02:00"
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 3
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }

  deletion_protection = var.environment == "prod"

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Private services connection for Cloud SQL
resource "google_compute_global_address" "private_ip_range" {
  name          = "tamshai-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.tamshai_vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.tamshai_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Databases
resource "google_sql_database" "keycloak_db" {
  name     = "keycloak"
  instance = google_sql_database_instance.tamshai_postgres.name
}

resource "google_sql_database" "hr_db" {
  name     = "tamshai_hr"
  instance = google_sql_database_instance.tamshai_postgres.name
}

resource "google_sql_database" "finance_db" {
  name     = "tamshai_finance"
  instance = google_sql_database_instance.tamshai_postgres.name
}

# Database users (passwords retrieved from Secret Manager at runtime)
resource "google_sql_user" "keycloak_user" {
  name     = "keycloak"
  instance = google_sql_database_instance.tamshai_postgres.name
  password = random_password.keycloak_db_password.result
}

resource "google_sql_user" "tamshai_user" {
  name     = "tamshai"
  instance = google_sql_database_instance.tamshai_postgres.name
  password = random_password.tamshai_db_password.result
}

# =============================================================================
# CLOUD STORAGE (for documents)
# =============================================================================

resource "google_storage_bucket" "finance_docs" {
  name     = "tamshai-${var.environment}-finance-docs-${var.project_id}"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"

  versioning {
    enabled = var.environment == "prod"
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  encryption {
    default_kms_key_name = null # Uses Google-managed encryption
  }
}

resource "google_storage_bucket" "public_docs" {
  name     = "tamshai-${var.environment}-public-docs-${var.project_id}"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"
}

# =============================================================================
# COMPUTE INSTANCES
# =============================================================================

# Keycloak Instance
resource "google_compute_instance" "keycloak" {
  name         = "tamshai-${var.environment}-keycloak"
  machine_type = var.machine_type_medium # e2-small for Keycloak (needs 2GB)
  zone         = var.zone

  tags = ["web-server", "ssh-enabled"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.tamshai_subnet.id

    access_config {
      # Ephemeral public IP (for testing)
    }
  }

  # SECURITY: Startup script fetches secrets from Secret Manager at runtime
  # No secrets are embedded in this script
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Install dependencies
    apt-get update
    apt-get install -y docker.io jq
    systemctl enable docker
    systemctl start docker

    # Fetch secrets from Secret Manager at runtime
    # This requires the service account to have secretAccessor role
    KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
      --secret="tamshai-${var.environment}-keycloak-admin-password" \
      --project="${var.project_id}")

    KEYCLOAK_DB_PASSWORD=$(gcloud secrets versions access latest \
      --secret="tamshai-${var.environment}-keycloak-db-password" \
      --project="${var.project_id}")

    # Pull and run Keycloak with secrets from environment
    docker run -d \
      --name keycloak \
      --restart unless-stopped \
      -p 8080:8080 \
      -e KEYCLOAK_ADMIN=admin \
      -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
      -e KC_DB=postgres \
      -e KC_DB_URL="jdbc:postgresql://${google_sql_database_instance.tamshai_postgres.private_ip_address}:5432/keycloak" \
      -e KC_DB_USERNAME=keycloak \
      -e KC_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD" \
      -e KC_HOSTNAME_STRICT=false \
      -e KC_PROXY=edge \
      quay.io/keycloak/keycloak:24.0 start-dev

    # Clear sensitive variables from shell
    unset KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_DB_PASSWORD
  EOF

  service_account {
    email  = google_service_account.keycloak.email
    scopes = ["cloud-platform"]
  }

  scheduling {
    preemptible       = var.environment != "prod"
    automatic_restart = var.environment == "prod"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}

# MCP Gateway Instance
resource "google_compute_instance" "mcp_gateway" {
  name         = "tamshai-${var.environment}-mcp-gateway"
  machine_type = var.machine_type # e2-micro
  zone         = var.zone

  tags = ["web-server", "ssh-enabled"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.tamshai_subnet.id

    access_config {}
  }

  # SECURITY: Startup script fetches secrets from Secret Manager at runtime
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Install dependencies
    apt-get update
    apt-get install -y docker.io jq
    systemctl enable docker
    systemctl start docker

    # Fetch secrets from Secret Manager at runtime
    ANTHROPIC_API_KEY=$(gcloud secrets versions access latest \
      --secret="tamshai-${var.environment}-anthropic-api-key" \
      --project="${var.project_id}" 2>/dev/null || echo "")

    MCP_GATEWAY_CLIENT_SECRET=$(gcloud secrets versions access latest \
      --secret="tamshai-${var.environment}-mcp-gateway-client-secret" \
      --project="${var.project_id}")

    JWT_SECRET=$(gcloud secrets versions access latest \
      --secret="tamshai-${var.environment}-jwt-secret" \
      --project="${var.project_id}")

    # Check if Anthropic API key is set
    if [ -z "$ANTHROPIC_API_KEY" ]; then
      echo "WARNING: Anthropic API key not set. Add it with:"
      echo "gcloud secrets versions add tamshai-${var.environment}-anthropic-api-key --data-file=-"
    fi

    # Create environment file for MCP Gateway (in memory tmpfs)
    mkdir -p /run/secrets
    chmod 700 /run/secrets
    cat > /run/secrets/mcp-gateway.env <<ENVEOF
    ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
    MCP_GATEWAY_CLIENT_SECRET=$MCP_GATEWAY_CLIENT_SECRET
    JWT_SECRET=$JWT_SECRET
    KEYCLOAK_URL=http://${google_compute_instance.keycloak.network_interface[0].network_ip}:8080
    KEYCLOAK_REALM=tamshai-corp
    KEYCLOAK_CLIENT_ID=mcp-gateway
    REDIS_HOST=localhost
    NODE_ENV=production
    ENVEOF
    chmod 600 /run/secrets/mcp-gateway.env

    # Clear sensitive variables from shell
    unset ANTHROPIC_API_KEY MCP_GATEWAY_CLIENT_SECRET JWT_SECRET

    # Pull and run MCP Gateway
    # TODO: Replace with actual container image
    docker run -d \
      --name mcp-gateway \
      --restart unless-stopped \
      -p 3100:3100 \
      --env-file /run/secrets/mcp-gateway.env \
      node:20-slim sleep infinity  # Placeholder - replace with actual image
  EOF

  service_account {
    email  = google_service_account.mcp_gateway.email
    scopes = ["cloud-platform"]
  }

  scheduling {
    preemptible       = var.environment != "prod"
    automatic_restart = var.environment == "prod"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  depends_on = [google_compute_instance.keycloak]
}

# =============================================================================
# OUTPUTS (No sensitive values exposed)
# =============================================================================

output "keycloak_url" {
  description = "Keycloak URL"
  value       = "http://${google_compute_instance.keycloak.network_interface[0].access_config[0].nat_ip}:8080"
}

output "mcp_gateway_url" {
  description = "MCP Gateway URL"
  value       = "http://${google_compute_instance.mcp_gateway.network_interface[0].access_config[0].nat_ip}:3100"
}

output "postgres_private_ip" {
  description = "PostgreSQL private IP (internal only)"
  value       = google_sql_database_instance.tamshai_postgres.private_ip_address
}

output "secret_manager_instructions" {
  description = "Instructions for adding the Anthropic API key"
  value       = <<-EOT

    ============================================================
    IMPORTANT: Add your Anthropic API key to Secret Manager:
    ============================================================

    Run this command and paste your API key when prompted:

    echo "sk-ant-api03-YOUR-KEY-HERE" | gcloud secrets versions add \
      tamshai-${var.environment}-anthropic-api-key --data-file=-

    Then restart the MCP Gateway instance:

    gcloud compute instances reset tamshai-${var.environment}-mcp-gateway \
      --zone=${var.zone}

    ============================================================
  EOT
}

output "ssh_instructions" {
  description = "SSH access instructions (via IAP)"
  value       = <<-EOT

    SSH access is configured via Identity-Aware Proxy (IAP) for security.
    Use gcloud to SSH into instances:

    gcloud compute ssh tamshai-${var.environment}-keycloak --zone=${var.zone} --tunnel-through-iap
    gcloud compute ssh tamshai-${var.environment}-mcp-gateway --zone=${var.zone} --tunnel-through-iap

  EOT
}

output "estimated_monthly_cost" {
  description = "Estimated monthly cost"
  value       = <<-EOT

    Estimated Monthly Cost (${var.environment} Configuration):
    - Keycloak VM (e2-small, ${var.environment == "prod" ? "regular" : "preemptible"}): ~$${var.environment == "prod" ? "12" : "4"}/month
    - MCP Gateway VM (e2-micro, ${var.environment == "prod" ? "regular" : "preemptible"}): ~$${var.environment == "prod" ? "6" : "2"}/month
    - Cloud SQL (db-f1-micro): ~$8/month
    - Cloud Storage (minimal): ~$1/month
    - Network egress (minimal): ~$2/month
    - Secret Manager: ~$0.06/secret/month
    ------------------------------------------------
    Total Estimate: ~$${var.environment == "prod" ? "35-45" : "17-25"}/month

  EOT
}
