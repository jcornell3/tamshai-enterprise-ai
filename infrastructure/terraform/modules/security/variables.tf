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

variable "claude_api_key" {
  description = "Anthropic Claude API key"
  type        = string
  sensitive   = true
}

# User Provisioning Job Variables
variable "vpc_connector_id" {
  description = "VPC Connector ID for Cloud Run Job (e.g., projects/PROJECT/locations/REGION/connectors/NAME)"
  type        = string
  default     = ""
}

variable "cloud_sql_connection_name" {
  description = "Cloud SQL connection name (project:region:instance)"
  type        = string
  default     = ""
}

variable "keycloak_url" {
  description = "Keycloak base URL with /auth suffix"
  type        = string
  default     = ""
}

variable "prod_user_password" {
  description = "Password for production users (used in user provisioning). If not set, a random password will be generated."
  type        = string
  sensitive   = true
  default     = ""
}

# Gap #43: MongoDB URI IAM binding
variable "enable_mongodb_uri_access" {
  description = "Enable IAM binding for MCP servers to access external mongodb-uri secret"
  type        = bool
  default     = true
}
