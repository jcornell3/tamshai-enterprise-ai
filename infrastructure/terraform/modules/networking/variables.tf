# Networking Module Variables

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

variable "enable_serverless_connector" {
  description = "Enable Serverless VPC Connector for Cloud Run"
  type        = bool
  default     = false
}

variable "serverless_connector_cidr" {
  description = "CIDR range for Serverless VPC Connector (must be /28)"
  type        = string
  default     = "10.8.0.0/28"
}

# =============================================================================
# REGIONAL EVACUATION SUPPORT
# =============================================================================

variable "name_suffix" {
  description = "Suffix to append to resource names for regional evacuation (e.g., '-recovery-20260122'). Leave empty for primary deployment."
  type        = string
  default     = ""
}
