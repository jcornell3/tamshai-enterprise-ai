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
