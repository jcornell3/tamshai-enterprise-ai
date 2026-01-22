# Database Module Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "network_id" {
  description = "ID of the VPC network for private IP"
  type        = string
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_16"
}

variable "database_tier" {
  description = "Cloud SQL tier (db-f1-micro, db-g1-small, etc.)"
  type        = string
  default     = "db-f1-micro"
}

variable "disk_size_gb" {
  description = "Disk size in GB"
  type        = number
  default     = 10
}

variable "enable_backups" {
  description = "Enable automated backups"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false
}

variable "keycloak_db_password" {
  description = "Password for Keycloak database user"
  type        = string
  sensitive   = true
}

variable "tamshai_db_password" {
  description = "Password for Tamshai database user"
  type        = string
  sensitive   = true
}

# =============================================================================
# REGIONAL EVACUATION SUPPORT
# =============================================================================

variable "name_suffix" {
  description = "Suffix to append to resource names for regional evacuation (e.g., '-recovery-20260122'). Leave empty for primary deployment."
  type        = string
  default     = ""
}
