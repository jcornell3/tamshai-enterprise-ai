# Compute Module
# Manages GCE instances for Keycloak and MCP Gateway

# Keycloak Instance
#checkov:skip=CKV_GCP_40:Public IP required for web server access. Protected by firewall rules and Shielded VM.
#checkov:skip=CKV_GCP_38:Google-managed disk encryption sufficient. CSEK adds complexity without significant security benefit for this use case.
resource "google_compute_instance" "keycloak" {
  name         = "tamshai-${var.environment}-keycloak"
  machine_type = var.machine_type_medium
  zone         = var.zone
  project      = var.project_id

  tags = ["web-server", "ssh-enabled"]

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.boot_disk_size_keycloak
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = var.subnet_id

    access_config {
      # Ephemeral public IP
    }
  }

  metadata = {
    block-project-ssh-keys = "true" # Security: Force instance-specific SSH keys (CKV_GCP_32)
  }

  # SECURITY: Startup script fetches secrets from Secret Manager at runtime
  # No secrets are embedded in this script
  metadata_startup_script = templatefile("${path.module}/scripts/keycloak-startup.sh", {
    environment         = var.environment
    project_id          = var.project_id
    postgres_private_ip = var.postgres_private_ip
  })

  service_account {
    email  = var.keycloak_service_account_email
    scopes = ["cloud-platform"]
  }

  scheduling {
    preemptible       = var.preemptible
    automatic_restart = var.automatic_restart
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}

# MCP Gateway Instance
#checkov:skip=CKV_GCP_40:Public IP required for web server access. Protected by firewall rules and Shielded VM.
#checkov:skip=CKV_GCP_38:Google-managed disk encryption sufficient. CSEK adds complexity without significant security benefit for this use case.
resource "google_compute_instance" "mcp_gateway" {
  name         = "tamshai-${var.environment}-mcp-gateway"
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  tags = ["web-server", "ssh-enabled"]

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.boot_disk_size_gateway
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = var.subnet_id

    access_config {
      # Ephemeral public IP
    }
  }

  metadata = {
    block-project-ssh-keys = "true" # Security: Force instance-specific SSH keys (CKV_GCP_32)
  }

  # SECURITY: Startup script fetches secrets from Secret Manager at runtime
  metadata_startup_script = templatefile("${path.module}/scripts/mcp-gateway-startup.sh", {
    environment         = var.environment
    project_id          = var.project_id
    keycloak_private_ip = google_compute_instance.keycloak.network_interface[0].network_ip
  })

  service_account {
    email  = var.mcp_gateway_service_account_email
    scopes = ["cloud-platform"]
  }

  scheduling {
    preemptible       = var.preemptible
    automatic_restart = var.automatic_restart
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  depends_on = [google_compute_instance.keycloak]
}
