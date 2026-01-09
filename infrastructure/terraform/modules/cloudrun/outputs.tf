# Cloud Run Module Outputs

# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================

output "artifact_registry_repository" {
  description = "Artifact Registry repository for Docker images"
  value       = google_artifact_registry_repository.tamshai.id
}

output "artifact_registry_url" {
  description = "Base URL for pushing Docker images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/tamshai"
}

# =============================================================================
# MCP GATEWAY
# =============================================================================

output "mcp_gateway_url" {
  description = "MCP Gateway Cloud Run URL"
  value       = google_cloud_run_service.mcp_gateway.status[0].url
}

output "mcp_gateway_service_name" {
  description = "MCP Gateway Cloud Run service name"
  value       = google_cloud_run_service.mcp_gateway.name
}

# =============================================================================
# MCP SUITE SERVICES
# =============================================================================

output "mcp_hr_url" {
  description = "MCP HR Cloud Run URL"
  value       = google_cloud_run_service.mcp_suite["hr"].status[0].url
}

output "mcp_finance_url" {
  description = "MCP Finance Cloud Run URL"
  value       = google_cloud_run_service.mcp_suite["finance"].status[0].url
}

output "mcp_sales_url" {
  description = "MCP Sales Cloud Run URL"
  value       = google_cloud_run_service.mcp_suite["sales"].status[0].url
}

output "mcp_support_url" {
  description = "MCP Support Cloud Run URL"
  value       = google_cloud_run_service.mcp_suite["support"].status[0].url
}

# =============================================================================
# KEYCLOAK
# =============================================================================

output "keycloak_url" {
  description = "Keycloak Cloud Run URL"
  value       = google_cloud_run_service.keycloak.status[0].url
}

output "keycloak_service_name" {
  description = "Keycloak Cloud Run service name"
  value       = google_cloud_run_service.keycloak.name
}

# =============================================================================
# SERVICE URLS MAP
# =============================================================================

output "service_urls" {
  description = "Map of all Cloud Run service URLs"
  value = {
    mcp_gateway = google_cloud_run_service.mcp_gateway.status[0].url
    mcp_hr      = google_cloud_run_service.mcp_suite["hr"].status[0].url
    mcp_finance = google_cloud_run_service.mcp_suite["finance"].status[0].url
    mcp_sales   = google_cloud_run_service.mcp_suite["sales"].status[0].url
    mcp_support = google_cloud_run_service.mcp_suite["support"].status[0].url
    keycloak    = google_cloud_run_service.keycloak.status[0].url
  }
}
