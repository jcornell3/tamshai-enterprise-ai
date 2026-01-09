# Security Module Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "GCP Region (required for Cloud Run IAM)"
  type        = string
  default     = "us-central1"
}

variable "enable_cloud_run_iam" {
  description = "Enable Cloud Run service-specific IAM bindings (set to false for GCE deployments)"
  type        = bool
  default     = false
}
