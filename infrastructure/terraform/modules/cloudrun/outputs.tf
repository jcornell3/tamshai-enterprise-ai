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

output "keycloak_domain_mapping" {
  description = "Keycloak custom domain mapping status"
  value = length(google_cloud_run_domain_mapping.keycloak) > 0 ? {
    domain = google_cloud_run_domain_mapping.keycloak[0].name
    status = google_cloud_run_domain_mapping.keycloak[0].status[0].conditions
  } : null
}

# =============================================================================
# WEB PORTAL
# =============================================================================

output "web_portal_url" {
  description = "Web Portal Cloud Run URL"
  value       = var.enable_web_portal ? google_cloud_run_service.web_portal[0].status[0].url : null
}

output "web_portal_service_name" {
  description = "Web Portal Cloud Run service name"
  value       = var.enable_web_portal ? google_cloud_run_service.web_portal[0].name : null
}

# =============================================================================
# SERVICE URLS MAP
# =============================================================================

output "service_urls" {
  description = "Map of all Cloud Run service URLs"
  value = merge(
    {
      mcp_gateway = google_cloud_run_service.mcp_gateway.status[0].url
      mcp_hr      = google_cloud_run_service.mcp_suite["hr"].status[0].url
      mcp_finance = google_cloud_run_service.mcp_suite["finance"].status[0].url
      mcp_sales   = google_cloud_run_service.mcp_suite["sales"].status[0].url
      mcp_support = google_cloud_run_service.mcp_suite["support"].status[0].url
      keycloak    = google_cloud_run_service.keycloak.status[0].url
    },
    var.enable_web_portal ? {
      web_portal = google_cloud_run_service.web_portal[0].status[0].url
    } : {}
  )
}
