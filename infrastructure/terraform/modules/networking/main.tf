# Networking Module
# Manages VPC, subnets, NAT, and firewall rules

# Local variables for naming
locals {
  name_prefix = "tamshai-${var.environment}${var.name_suffix}"
  # VPC connector name has max 25 chars: ^[a-z][-a-z0-9]{0,23}[a-z0-9]$
  # Use shorter name for connector: "tamshai-<env>-conn" or "tamshai-<env>-<hash>"
  connector_name = var.name_suffix != "" ? "tamshai-${substr(md5(var.name_suffix), 0, 8)}" : "tamshai-${var.environment}-conn"
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  description             = "VPC for Tamshai Enterprise AI - ${var.environment}${var.name_suffix != "" ? " (${var.name_suffix})" : ""}"
}

# Subnet for services
resource "google_compute_subnetwork" "subnet" {
  name          = "${local.name_prefix}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud Router for NAT
resource "google_compute_router" "router" {
  name    = "${local.name_prefix}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "nat" {
  name                               = "${local.name_prefix}-nat"
  router                             = google_compute_router.router.name
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
  name    = "${local.name_prefix}-allow-internal"
  network = google_compute_network.vpc.name

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

  source_ranges = [var.subnet_cidr]
}

# Allow HTTP/HTTPS from anywhere
#checkov:skip=CKV_GCP_106:HTTP port 80 required for HTTPS redirect (Caddy/nginx). All traffic redirected to HTTPS.
resource "google_compute_firewall" "allow_http" {
  name    = "${local.name_prefix}-allow-http"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = var.allowed_http_ports
  }

  source_ranges = var.http_source_ranges
  target_tags   = ["web-server"]
}

# Allow SSH via IAP only (more secure than open SSH)
resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "${local.name_prefix}-allow-iap-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ssh-enabled"]
}

# =============================================================================
# SERVERLESS VPC CONNECTOR (for Cloud Run to access private resources)
# =============================================================================

# Serverless VPC Access Connector for Cloud Run
# Enables Cloud Run services to access Cloud SQL and Redis on private IPs
resource "google_vpc_access_connector" "serverless_connector" {
  count = var.enable_serverless_connector ? 1 : 0

  name          = local.connector_name
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = var.serverless_connector_cidr
  min_instances = 2
  max_instances = 3

  # Use gen2 for better performance and lower cost
  machine_type = "e2-micro"
}

# Firewall rule to allow Serverless VPC Connector traffic
resource "google_compute_firewall" "allow_serverless_connector" {
  count = var.enable_serverless_connector ? 1 : 0

  name    = "${local.name_prefix}-allow-serverless-connector"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }

  # Serverless VPC Connector IP range
  source_ranges = [var.serverless_connector_cidr]
}
