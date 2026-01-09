# GCP Phase 1 Outputs

# =============================================================================
# CLOUD RUN SERVICE URLS
# =============================================================================

output "mcp_gateway_url" {
  description = "MCP Gateway Cloud Run URL"
  value       = module.cloudrun.mcp_gateway_url
}

output "mcp_hr_url" {
  description = "MCP HR Cloud Run URL"
  value       = module.cloudrun.mcp_hr_url
}

output "mcp_finance_url" {
  description = "MCP Finance Cloud Run URL"
  value       = module.cloudrun.mcp_finance_url
}

output "mcp_sales_url" {
  description = "MCP Sales Cloud Run URL"
  value       = module.cloudrun.mcp_sales_url
}

output "mcp_support_url" {
  description = "MCP Support Cloud Run URL"
  value       = module.cloudrun.mcp_support_url
}

output "keycloak_url" {
  description = "Keycloak Cloud Run URL"
  value       = module.cloudrun.keycloak_url
}

# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================

output "artifact_registry_url" {
  description = "Artifact Registry URL for pushing Docker images"
  value       = module.cloudrun.artifact_registry_url
}

# =============================================================================
# DATABASE
# =============================================================================

output "postgres_connection_name" {
  description = "Cloud SQL PostgreSQL connection name"
  value       = module.database.postgres_connection_name
}

output "postgres_private_ip" {
  description = "Cloud SQL PostgreSQL private IP"
  value       = module.database.postgres_private_ip
  sensitive   = true
}

# =============================================================================
# STORAGE
# =============================================================================

output "static_website_bucket_name" {
  description = "Static website GCS bucket name"
  value       = module.storage.static_website_bucket_name
}

output "static_website_url" {
  description = "Static website public URL"
  value       = module.storage.static_website_url
}

output "finance_docs_bucket_name" {
  description = "Finance documents bucket name"
  value       = module.storage.finance_docs_bucket_name
}

# =============================================================================
# NETWORKING
# =============================================================================

output "vpc_network_name" {
  description = "VPC network name"
  value       = module.networking.network_name
}

output "serverless_connector_id" {
  description = "Serverless VPC Connector ID"
  value       = module.networking.serverless_connector_id
}

# =============================================================================
# UTILITY VM (Phase 1 only)
# =============================================================================

output "utility_vm_ip" {
  description = "Utility VM private IP (Redis host)"
  value       = var.enable_utility_vm ? module.utility_vm[0].keycloak_instance_private_ip : null
  sensitive   = true
}

output "utility_vm_public_ip" {
  description = "Utility VM public IP (Bastion host)"
  value       = var.enable_utility_vm ? module.utility_vm[0].keycloak_instance_public_ip : null
}

# =============================================================================
# DNS CONFIGURATION
# =============================================================================

output "dns_records" {
  description = "DNS records to configure in your DNS provider"
  value = {
    api = {
      type  = "CNAME"
      name  = "api.tamshai.com"
      value = trimprefix(module.cloudrun.mcp_gateway_url, "https://")
    }
    auth = {
      type  = "CNAME"
      name  = "auth.tamshai.com"
      value = trimprefix(module.cloudrun.keycloak_url, "https://")
    }
    website = {
      type  = "CNAME"
      name  = "prod.tamshai.com"
      value = "c.storage.googleapis.com"
    }
  }
}

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================

output "deployment_summary" {
  description = "Deployment summary and next steps"
  value = <<-EOT

    ========================================
    Tamshai Enterprise AI - Phase 1 Deployed
    ========================================

    Services:
    - MCP Gateway: ${module.cloudrun.mcp_gateway_url}
    - Keycloak:    ${module.cloudrun.keycloak_url}
    - Website:     ${module.storage.static_website_url}

    Next Steps:
    1. Configure DNS records (see 'dns_records' output)
    2. Push Docker images to: ${module.cloudrun.artifact_registry_url}
    3. Deploy services via GitHub Actions workflow
    4. Sync Keycloak realm configuration
    5. Upload static website content to: ${module.storage.static_website_bucket_name}

    Estimated Monthly Cost: $50-80 USD

    Documentation: docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md
    EOT
}
