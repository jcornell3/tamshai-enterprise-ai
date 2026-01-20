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

output "cicd_service_account_email" {
  description = "Email of the CI/CD service account"
  value       = google_service_account.cicd.email
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
    keycloak_admin_password      = google_secret_manager_secret.keycloak_admin_password.id
    keycloak_db_password         = google_secret_manager_secret.keycloak_db_password.id
    tamshai_db_password          = google_secret_manager_secret.tamshai_db_password.id
    anthropic_api_key            = google_secret_manager_secret.anthropic_api_key.id
    mcp_gateway_client_secret    = google_secret_manager_secret.mcp_gateway_client_secret.id
    jwt_secret                   = google_secret_manager_secret.jwt_secret.id
    mcp_hr_service_client_secret = google_secret_manager_secret.mcp_hr_service_client_secret.id
    prod_user_password           = google_secret_manager_secret.prod_user_password.id
  }
}

# Cloud Build Configuration
output "cloudbuild_service_account" {
  description = "Service account used by Cloud Build (Compute Engine default)"
  value       = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

output "prod_user_password" {
  description = "Generated password for production users (used in user provisioning)"
  value       = random_password.prod_user_password.result
  sensitive   = true
}

# Provisioning Job Outputs
output "provision_job_name" {
  description = "Name of the user provisioning Cloud Run job"
  value       = var.enable_provision_job ? google_cloud_run_v2_job.provision_users[0].name : ""
}

output "provision_job_service_account" {
  description = "Service account email for the provisioning job"
  value       = google_service_account.provision_job.email
}
