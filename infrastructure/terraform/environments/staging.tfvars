# Staging Environment Configuration
# Use with: terraform plan -var-file=environments/staging.tfvars
# Or set TF_WORKSPACE=tamshai-staging

project_id  = "your-gcp-project-id"  # UPDATE THIS
environment = "staging"

# Region and Zone
region = "us-west1"     # Oregon
zone   = "us-west1-b"

# Networking
subnet_cidr         = "10.1.0.0/24"
allowed_http_ports  = ["80", "443", "8080", "3000", "3100"]
http_source_ranges  = ["0.0.0.0/0"]  # Consider restricting to office IP in staging

# Database - Production-like configuration
database_version = "POSTGRES_16"
database_tier    = "db-g1-small"  # 1 shared vCPU, 1.7 GB RAM
disk_size_gb     = 20

# Storage - Enable versioning, moderate retention
lifecycle_age_days = 180  # Delete after 180 days

# Compute - Regular instances (not preemptible) for stability
machine_type        = "e2-small"   # 0.5 vCPU, 2GB RAM
machine_type_medium = "e2-medium"  # 1 vCPU, 4GB RAM

boot_disk_size_keycloak = 30
boot_disk_size_gateway  = 20

# Estimated Cost: ~$45-60/month
