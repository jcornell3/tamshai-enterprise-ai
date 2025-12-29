# Root Module Variables
# These are the input variables for the entire infrastructure

# =============================================================================
# REQUIRED VARIABLES (Must be provided via tfvars or command line)
# =============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

# =============================================================================
# OPTIONAL VARIABLES (Have defaults)
# =============================================================================

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
  description = "Environment name (dev, staging, prod). If not set, derived from workspace name."
  type        = string
  default     = null
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "tamshai.local"
}

# =============================================================================
# NETWORKING VARIABLES
# =============================================================================

variable "subnet_cidr" {
  description = "CIDR range for the subnet"
  type        = string
  default     = "10.0.0.0/24"
}

variable "allowed_http_ports" {
  description = "List of HTTP/HTTPS ports to allow"
  type        = list(string)
  default     = ["80", "443", "8080", "8000", "3000", "3100"]
}

variable "http_source_ranges" {
  description = "Source IP ranges allowed for HTTP/HTTPS traffic"
  type        = list(string)
  default     = ["0.0.0.0/0"] # Restrict in production
}

# =============================================================================
# DATABASE VARIABLES
# =============================================================================

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_16"
}

variable "database_tier" {
  description = "Cloud SQL tier"
  type        = string
  default     = "db-f1-micro" # Shared vCPU, 0.6 GB RAM - ~$8/month
}

variable "disk_size_gb" {
  description = "Database disk size in GB"
  type        = number
  default     = 10
}

# =============================================================================
# STORAGE VARIABLES
# =============================================================================

variable "lifecycle_age_days" {
  description = "Delete objects older than this many days"
  type        = number
  default     = 365
}

# =============================================================================
# COMPUTE VARIABLES
# =============================================================================

variable "machine_type" {
  description = "GCE machine type for MCP Gateway"
  type        = string
  default     = "e2-micro" # 0.25 vCPU, 1GB RAM - ~$6/month
}

variable "machine_type_medium" {
  description = "GCE machine type for memory-intensive services (Keycloak)"
  type        = string
  default     = "e2-small" # 0.5 vCPU, 2GB RAM - ~$12/month
}

variable "boot_disk_size_keycloak" {
  description = "Boot disk size for Keycloak in GB"
  type        = number
  default     = 20
}

variable "boot_disk_size_gateway" {
  description = "Boot disk size for MCP Gateway in GB"
  type        = number
  default     = 10
}
