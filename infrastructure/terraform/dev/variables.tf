# =============================================================================
# Terraform Dev Environment - Variables
# =============================================================================

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_root" {
  description = "Absolute path to project root"
  type        = string
  default     = "C:/Users/jcorn/tamshai-enterprise-ai"
}

variable "docker_compose_dir" {
  description = "Path to docker-compose directory (relative to project root)"
  type        = string
  default     = "infrastructure/docker"
}

# =============================================================================
# Database Credentials
# =============================================================================

variable "postgres_password" {
  description = "PostgreSQL superuser password"
  type        = string
  sensitive   = true
  default     = "postgres_password"
}

variable "tamshai_db_password" {
  description = "Tamshai application database password"
  type        = string
  sensitive   = true
  default     = "tamshai_password"
}

variable "keycloak_db_password" {
  description = "Keycloak database password"
  type        = string
  sensitive   = true
  default     = "keycloak_password"
}

variable "mongodb_root_password" {
  description = "MongoDB root password"
  type        = string
  sensitive   = true
  default     = "tamshai_password"
}

# =============================================================================
# Keycloak Configuration
# =============================================================================

variable "keycloak_admin_password" {
  description = "Keycloak admin password"
  type        = string
  sensitive   = true
  default     = "admin"
}

variable "test_user_password" {
  description = "Test user password (for dev test users)"
  type        = string
  sensitive   = true
  default     = "password123"
}

variable "mcp_gateway_client_secret" {
  description = "OAuth client secret for MCP Gateway"
  type        = string
  sensitive   = true
  default     = "test-client-secret"
}

# =============================================================================
# Storage Credentials
# =============================================================================

variable "minio_root_user" {
  description = "MinIO root username"
  type        = string
  default     = "minioadmin"
}

variable "minio_root_password" {
  description = "MinIO root password"
  type        = string
  sensitive   = true
  default     = "minioadmin"
}

# =============================================================================
# Redis Configuration
# =============================================================================

variable "redis_password" {
  description = "Redis AUTH password (optional for dev)"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Claude API Configuration
# =============================================================================

variable "claude_api_key" {
  description = "Claude API key for MCP Gateway"
  type        = string
  sensitive   = true
}

# =============================================================================
# Docker Compose Configuration
# =============================================================================

variable "docker_compose_project" {
  description = "Docker Compose project name"
  type        = string
  default     = "tamshai-dev"
}

variable "auto_start_services" {
  description = "Automatically start Docker services on apply"
  type        = bool
  default     = true
}

variable "auto_stop_services" {
  description = "Automatically stop Docker services on destroy"
  type        = bool
  default     = true
}
