# Storage Module Variables

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

variable "force_destroy" {
  description = "Allow bucket deletion even if not empty"
  type        = bool
  default     = true # Set to false for prod
}

variable "enable_versioning" {
  description = "Enable object versioning"
  type        = bool
  default     = false # Enable for prod
}

variable "lifecycle_age_days" {
  description = "Delete objects older than this many days"
  type        = number
  default     = 365
}

variable "enable_static_website" {
  description = "Enable static website bucket for prod.tamshai.com"
  type        = bool
  default     = false
}

variable "static_website_domain" {
  description = "Domain name for static website bucket (must match bucket name)"
  type        = string
  default     = "prod.tamshai.com"
}

variable "cicd_service_account_email" {
  description = "Email of CI/CD service account for deployment permissions"
  type        = string
  default     = ""
}

# =============================================================================
# REGIONAL EVACUATION SUPPORT
# =============================================================================

variable "enable_backup_bucket" {
  description = "Enable multi-regional backup bucket for disaster recovery. Stores Cloud SQL exports for cross-region restore."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Number of days to retain backups before automatic deletion"
  type        = number
  default     = 90
}
