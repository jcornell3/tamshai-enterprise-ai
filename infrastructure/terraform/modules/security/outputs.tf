# Security Module Outputs

# Service Account Emails
output "keycloak_service_account_email" {
  description = "Email of the Keycloak service account"
  value       = google_service_account.keycloak.email
}

output "mcp_gateway_service_account_email" {
  description = "Email of the MCP Gateway service account"
  value       = google_service_account.mcp_gateway.email
}

output "mcp_servers_service_account_email" {
  description = "Email of the MCP Servers service account"
  value       = google_service_account.mcp_servers.email
}

# Generated Passwords (sensitive)
output "keycloak_db_password" {
  description = "Generated password for Keycloak database user"
  value       = random_password.keycloak_db_password.result
  sensitive   = true
}

output "tamshai_db_password" {
  description = "Generated password for Tamshai database user"
  value       = random_password.tamshai_db_password.result
  sensitive   = true
}

output "secret_ids" {
  description = "Map of secret IDs for reference"
  value = {
    keycloak_admin_password   = google_secret_manager_secret.keycloak_admin_password.id
    keycloak_db_password      = google_secret_manager_secret.keycloak_db_password.id
    tamshai_db_password       = google_secret_manager_secret.tamshai_db_password.id
    anthropic_api_key         = google_secret_manager_secret.anthropic_api_key.id
    mcp_gateway_client_secret = google_secret_manager_secret.mcp_gateway_client_secret.id
    jwt_secret                = google_secret_manager_secret.jwt_secret.id
  }
}
