# GCP Production Environment Configuration
#
# IMPORTANT: This configuration is for GCP production deployment only.
# For staging (VPS deployment), see: infrastructure/terraform/vps/
# For development (local Docker), see: infrastructure/docker/
#
# Use with: terraform plan -var-file=environments/production.tfvars
# Or set TF_WORKSPACE=tamshai-production

project_id  = "your-gcp-project-id" # UPDATE THIS - Your GCP project ID
environment = "production"

# Region and Zone
region = "us-central1" # Iowa (multi-region support)
zone   = "us-central1-a"

# Networking
subnet_cidr        = "10.2.0.0/24"
allowed_http_ports = ["443", "8080"] # HTTPS only, no dev ports
http_source_ranges = ["0.0.0.0/0"]   # SECURITY: Restrict to known IPs or use Cloud Armor in production
# Examples:
# - Office IP: ["203.0.113.0/24"]
# - Cloudflare: Use cloudflare IP ranges
# - VPN: Restrict to VPN gateway IPs

# Database - Production-grade configuration
database_version = "POSTGRES_16"
database_tier    = "db-custom-2-7680" # 2 vCPU, 7.5 GB RAM
disk_size_gb     = 50

# Storage - Full versioning, long retention
lifecycle_age_days = 2555 # 7 years for compliance

# Compute - Production instances with automatic restart
machine_type        = "e2-standard-2" # 2 vCPU, 8GB RAM
machine_type_medium = "e2-standard-4" # 4 vCPU, 16GB RAM

boot_disk_size_keycloak = 50
boot_disk_size_gateway  = 30

# Domain (optional - not currently used by modules, but available for future features)
# domain = "tamshai.example.com"

# =========================================================================
# ESTIMATED MONTHLY COST (us-central1 region, no sustained use discounts)
# =========================================================================
#
# Core Infrastructure:
#   - Cloud SQL (db-custom-2-7680):      ~$94/month  (2 vCPU, 7.5GB RAM, 50GB SSD)
#   - Keycloak VM (e2-standard-4):       ~$121/month (4 vCPU, 16GB RAM)
#   - MCP Gateway VM (e2-standard-2):    ~$61/month  (2 vCPU, 8GB RAM)
#   - Boot disks (80GB total):           ~$13/month
#   - Cloud NAT:                         ~$44/month  (gateway + data processing)
#   - Network egress (minimal):          ~$5/month
#   - Cloud Storage & Secret Manager:    ~$2/month
#   ------------------------------------------------
#   TOTAL CORE:                          ~$340/month
#
# Optional Add-ons:
#   - Cloud Armor (DDoS protection):     +$1.50/policy + $0.75/1M requests
#   - Load Balancer (global):            +$18/month + $0.008/GB
#   - Cloud CDN (static assets):         +$0.04/GB + $0.0075/10k requests
#
# Cost Optimization Options:
#   1. Use preemptible VMs (non-production): Save ~60% on compute
#   2. Committed use discounts (1-year):     Save ~30% on regular VMs
#   3. Sustained use discounts (automatic):  Save up to 30% on compute
#   4. Reduce VM sizes for lower traffic:    Use e2-medium (~$24/month each)
#
# =========================================================================
