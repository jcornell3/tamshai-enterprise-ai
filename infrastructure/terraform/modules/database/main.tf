# Database Module
# Manages Cloud SQL PostgreSQL and databases

# Local variables for naming
locals {
  instance_name = "tamshai-${var.environment}-postgres${var.name_suffix}"
}

# Private services connection for Cloud SQL
resource "google_compute_global_address" "private_ip_range" {
  name          = "tamshai-${var.environment}-private-ip${var.name_suffix}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = var.network_id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = var.network_id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Cloud SQL PostgreSQL Instance
#checkov:skip=CKV_GCP_6:SSL enforced via ssl_mode=ENCRYPTED_ONLY (GCP recommended over require_ssl)
#checkov:skip=CKV_GCP_55:PostgreSQL log_min_messages set to ERROR with comprehensive audit logging
#checkov:skip=CKV_GCP_109:PostgreSQL logging configured with pgAudit for SOC 2 compliance
#checkov:skip=CKV_GCP_79:POSTGRES_16 is the latest GA major version. Checkov rule may expect different format.
resource "google_sql_database_instance" "postgres" {
  name             = local.instance_name
  database_version = var.database_version
  region           = var.region
  project          = var.project_id

  settings {
    tier = var.database_tier
    # Use ENTERPRISE edition (not ENTERPRISE_PLUS) to support db-f1-micro tier
    edition = "ENTERPRISE"

    disk_size       = var.disk_size_gb
    disk_type       = "PD_SSD"
    disk_autoresize = false # Keep costs predictable

    ip_configuration {
      ipv4_enabled    = false # Use private IP only
      private_network = var.network_id
      ssl_mode        = "ENCRYPTED_ONLY" # Security: Enforce SSL (replaces deprecated require_ssl)
    }

    backup_configuration {
      enabled    = var.enable_backups
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

    # Security: Enhanced audit logging for SOC 2 compliance (CKV2_GCP_13, CKV_GCP_54, CKV_GCP_108-111)
    database_flags {
      name  = "log_duration"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    database_flags {
      name  = "log_hostname"
      value = "on"
    }

    database_flags {
      name  = "log_min_messages"
      value = "error" # Lowercase for PostgreSQL
    }

    database_flags {
      name  = "log_statement"
      value = "ddl" # Log DDL statements (CREATE, ALTER, DROP)
    }

    # pgAudit extension for comprehensive audit logging
    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }

    database_flags {
      name  = "pgaudit.log"
      value = "ddl,write" # Log DDL and write operations (less verbose than "all") - no spaces
    }
  }

  deletion_protection = var.deletion_protection

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Databases
resource "google_sql_database" "keycloak_db" {
  name     = "keycloak"
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

resource "google_sql_database" "hr_db" {
  name     = "tamshai_hr"
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

resource "google_sql_database" "finance_db" {
  name     = "tamshai_finance"
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

# Database users
resource "google_sql_user" "keycloak_user" {
  name     = "keycloak"
  instance = google_sql_database_instance.postgres.name
  password = var.keycloak_db_password
  project  = var.project_id
}

resource "google_sql_user" "tamshai_user" {
  name     = "tamshai"
  instance = google_sql_database_instance.postgres.name
  password = var.tamshai_db_password
  project  = var.project_id
}
