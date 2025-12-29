# Development Environment Configuration
# Use with: terraform plan -var-file=environments/dev.tfvars
# Or set TF_WORKSPACE=tamshai-dev

project_id  = "your-gcp-project-id"  # UPDATE THIS
environment = "dev"

# Region and Zone
region = "us-west1"     # Oregon
zone   = "us-west1-b"

# Networking
subnet_cidr         = "10.0.0.0/24"
allowed_http_ports  = ["80", "443", "8080", "8000", "3000", "3100"]
http_source_ranges  = ["0.0.0.0/0"]  # Allow from anywhere (dev only)

# Database - Minimal cost configuration
database_version = "POSTGRES_16"
database_tier    = "db-f1-micro"  # Shared CPU, 0.6 GB RAM
disk_size_gb     = 10

# Storage - No versioning, allow deletion
lifecycle_age_days = 90  # Delete after 90 days

# Compute - Preemptible instances for cost savings
machine_type        = "e2-micro"  # 0.25 vCPU, 1GB RAM
machine_type_medium = "e2-small"  # 0.5 vCPU, 2GB RAM

boot_disk_size_keycloak = 20
boot_disk_size_gateway  = 10

# Estimated Cost: ~$17-25/month
