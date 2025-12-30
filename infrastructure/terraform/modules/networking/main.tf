# Networking Module
# Manages VPC, subnets, NAT, and firewall rules

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "tamshai-${var.environment}-vpc"
  auto_create_subnetworks = false
  description             = "VPC for Tamshai Enterprise AI - ${var.environment}"
}

# Subnet for services
resource "google_compute_subnetwork" "subnet" {
  name          = "tamshai-${var.environment}-subnet"
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
  name    = "tamshai-${var.environment}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "nat" {
  name                               = "tamshai-${var.environment}-nat"
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
  name    = "tamshai-${var.environment}-allow-internal"
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
resource "google_compute_firewall" "allow_http" {
  name    = "tamshai-${var.environment}-allow-http"
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
  name    = "tamshai-${var.environment}-allow-iap-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP's IP range
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["ssh-enabled"]
}
