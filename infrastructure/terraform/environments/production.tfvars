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
http_source_ranges = ["0.0.0.0/0"]   # Use Cloud Armor or IP allowlist in production

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

# Estimated Cost: ~$150-200/month
# Note: Add Cloud Armor ($1.50/policy/month + $0.75/1M requests)
#       Add Load Balancer ($18/month + $0.008/GB)
#       Consider Cloud CDN for static assets
