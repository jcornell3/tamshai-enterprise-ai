# Tamshai Corp Enterprise AI - GCP Infrastructure
# Terraform configuration for testing/development (e2-micro instances)
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
      version = "~> 5.0"
    }
  }
  
  # Backend configuration for state storage (uncomment for production)
  # backend "gcs" {
  #   bucket = "tamshai-terraform-state"
  #   prefix = "enterprise-ai"
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
  default     = "us-west1"  # Oregon - typically cheaper
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
  default     = "e2-micro"  # 0.25 vCPU, 1GB RAM - ~$6/month
}

# For services needing more memory (Keycloak, Elasticsearch)
variable "machine_type_medium" {
  description = "GCE machine type for memory-intensive services"
  type        = string
  default     = "e2-small"  # 0.5 vCPU, 2GB RAM - ~$12/month
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
    ports    = ["80", "443", "8080", "8000", "3000"]
  }
  
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]
}

# Allow SSH (for debugging - should use IAP in production)
resource "google_compute_firewall" "allow_ssh" {
  name    = "tamshai-${var.environment}-allow-ssh"
  network = google_compute_network.tamshai_vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  
  source_ranges = ["0.0.0.0/0"]  # Restrict to your IP in production
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
    
    disk_size         = 10  # GB
    disk_type         = "PD_SSD"
    disk_autoresize   = false  # Keep costs predictable
    
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.tamshai_vpc.id
      
      authorized_networks {
        name  = "allow-all-for-testing"
        value = "0.0.0.0/0"  # Restrict in production!
      }
    }
    
    backup_configuration {
      enabled    = false  # Enable for production
      start_time = "02:00"
    }
    
    maintenance_window {
      day  = 7  # Sunday
      hour = 3
    }
  }
  
  deletion_protection = false  # Set to true for production
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

# Database users
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
  force_destroy               = true  # For testing only
  
  versioning {
    enabled = false  # Enable for production
  }
  
  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "public_docs" {
  name     = "tamshai-${var.environment}-public-docs-${var.project_id}"
  location = var.region
  
  uniform_bucket_level_access = true
  force_destroy               = true
}

# =============================================================================
# COMPUTE INSTANCES
# =============================================================================

# Keycloak Instance
resource "google_compute_instance" "keycloak" {
  name         = "tamshai-${var.environment}-keycloak"
  machine_type = var.machine_type_medium  # e2-small for Keycloak (needs 2GB)
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
  
  metadata_startup_script = <<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
    
    # Pull and run Keycloak
    docker run -d \
      --name keycloak \
      -p 8080:8080 \
      -e KEYCLOAK_ADMIN=admin \
      -e KEYCLOAK_ADMIN_PASSWORD=${random_password.keycloak_admin_password.result} \
      -e KC_DB=postgres \
      -e KC_DB_URL=jdbc:postgresql://${google_sql_database_instance.tamshai_postgres.private_ip_address}:5432/keycloak \
      -e KC_DB_USERNAME=keycloak \
      -e KC_DB_PASSWORD=${random_password.keycloak_db_password.result} \
      quay.io/keycloak/keycloak:24.0 start-dev
  EOF
  
  service_account {
    scopes = ["cloud-platform"]
  }
  
  scheduling {
    preemptible       = true   # Use preemptible for cost savings in testing
    automatic_restart = false
  }
}

# MCP Gateway Instance
resource "google_compute_instance" "mcp_gateway" {
  name         = "tamshai-${var.environment}-mcp-gateway"
  machine_type = var.machine_type  # e2-micro
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
  
  metadata_startup_script = <<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y docker.io
    systemctl enable docker
    systemctl start docker
  EOF
  
  service_account {
    scopes = ["cloud-platform"]
  }
  
  scheduling {
    preemptible       = true
    automatic_restart = false
  }
}

# =============================================================================
# SECRETS
# =============================================================================

resource "random_password" "keycloak_admin_password" {
  length  = 16
  special = true
}

resource "random_password" "keycloak_db_password" {
  length  = 16
  special = false  # Some special chars cause issues with JDBC URLs
}

resource "random_password" "tamshai_db_password" {
  length  = 16
  special = false
}

# Store secrets in Secret Manager (optional for testing)
resource "google_secret_manager_secret" "keycloak_admin" {
  secret_id = "tamshai-${var.environment}-keycloak-admin"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "keycloak_admin" {
  secret      = google_secret_manager_secret.keycloak_admin.id
  secret_data = random_password.keycloak_admin_password.result
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "keycloak_url" {
  description = "Keycloak URL"
  value       = "http://${google_compute_instance.keycloak.network_interface[0].access_config[0].nat_ip}:8080"
}

output "keycloak_admin_password" {
  description = "Keycloak admin password"
  value       = random_password.keycloak_admin_password.result
  sensitive   = true
}

output "mcp_gateway_ip" {
  description = "MCP Gateway public IP"
  value       = google_compute_instance.mcp_gateway.network_interface[0].access_config[0].nat_ip
}

output "postgres_connection" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${google_sql_database_instance.tamshai_postgres.private_ip_address}:5432"
}

output "estimated_monthly_cost" {
  description = "Estimated monthly cost"
  value       = <<-EOT
    Estimated Monthly Cost (Testing Configuration):
    - Keycloak VM (e2-small, preemptible): ~$4/month
    - MCP Gateway VM (e2-micro, preemptible): ~$2/month
    - Cloud SQL (db-f1-micro): ~$8/month
    - Cloud Storage (minimal): ~$1/month
    - Network egress (minimal): ~$2/month
    ------------------------------------------------
    Total Estimate: ~$17-25/month
    
    Note: Preemptible VMs may be terminated. Use regular VMs for stable testing.
    Production estimate with regular VMs: ~$35-45/month
  EOT
}
