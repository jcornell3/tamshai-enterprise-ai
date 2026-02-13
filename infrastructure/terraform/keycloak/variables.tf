variable "keycloak_url" {
  description = "Keycloak base URL"
  type        = string
}

variable "keycloak_admin_user" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password"
  type        = string
  sensitive   = true
}

variable "realm_name" {
  description = "Realm name to create"
  type        = string
  default     = "tamshai-corp"
}

variable "realm_display_name" {
  description = "Realm display name"
  type        = string
  default     = "Tamshai Corporation"
}

variable "test_user_password" {
  description = "Password for test users (set via TF_VAR_test_user_password or -var)"
  type        = string
  sensitive   = true
  # No default - must be provided via environment variable or tfvars
}

variable "mcp_gateway_client_secret" {
  description = "Client secret for MCP Gateway"
  type        = string
  sensitive   = true
  default     = "mcp-gateway-secret"
}

variable "mcp_hr_service_client_secret" {
  description = "Client secret for MCP HR Service (identity sync)"
  type        = string
  sensitive   = true
  default     = "hr-service-secret"
}

variable "mcp_integration_runner_secret" {
  description = "Client secret for MCP Integration Runner (test-only service account for token exchange). Only used in dev/CI environments."
  type        = string
  sensitive   = true
  default     = "integration-runner-secret-change-in-prod"
}

variable "tls_insecure_skip_verify" {
  description = "Skip TLS verification (for local dev with self-signed certs)"
  type        = bool
  default     = false
}

variable "environment" {
  description = "Environment name (dev, ci, stage, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "ci", "stage", "prod"], var.environment)
    error_message = "Environment must be one of: dev, ci, stage, prod"
  }
}

variable "valid_redirect_uris" {
  description = "Valid redirect URIs for MCP Gateway client. Must be passed via -var flag (no default - ports come from GitHub Variables)."
  type        = list(string)
}

variable "web_origins" {
  description = "Allowed CORS origins for Keycloak clients (explicit, no wildcards). Must be passed via -var flag (no default - ports come from GitHub Variables)."
  type        = list(string)
}

variable "direct_access_grants_enabled" {
  description = "Enable Resource Owner Password Credentials (ROPC) flow for mcp-gateway client. SECURITY: Only enable in dev/CI for integration testing. Disable in stage/prod per OAuth 2.0 Security BCP (RFC 8252)."
  type        = bool
  default     = false  # Secure default: disabled
}
