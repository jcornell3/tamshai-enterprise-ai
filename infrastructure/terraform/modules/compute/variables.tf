# Compute Module Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

variable "zone" {
  description = "GCP Zone"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "subnet_id" {
  description = "ID of the subnet for instances"
  type        = string
}

variable "machine_type" {
  description = "Machine type for MCP Gateway (e2-micro)"
  type        = string
  default     = "e2-micro"
}

variable "machine_type_medium" {
  description = "Machine type for memory-intensive services (e2-small)"
  type        = string
  default     = "e2-small"
}

variable "boot_image" {
  description = "Boot disk image"
  type        = string
  default     = "debian-cloud/debian-12"
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

variable "preemptible" {
  description = "Use preemptible instances (cheaper but can be terminated)"
  type        = bool
  default     = true # Set to false for prod
}

variable "automatic_restart" {
  description = "Automatically restart instances on failure"
  type        = bool
  default     = false # Set to true for prod
}

variable "keycloak_service_account_email" {
  description = "Email of the Keycloak service account"
  type        = string
}

variable "mcp_gateway_service_account_email" {
  description = "Email of the MCP Gateway service account"
  type        = string
}

variable "postgres_private_ip" {
  description = "Private IP of PostgreSQL instance"
  type        = string
}
