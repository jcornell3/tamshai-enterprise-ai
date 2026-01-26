# Root Module Outputs
# Aggregates outputs from all child modules

# =============================================================================
# NETWORKING OUTPUTS
# =============================================================================

output "network_name" {
  description = "Name of the VPC network"
  value       = module.networking.network_name
}

output "subnet_name" {
  description = "Name of the subnet"
  value       = module.networking.subnet_name
}

# =============================================================================
# COMPUTE OUTPUTS
# =============================================================================

output "keycloak_url" {
  description = "Keycloak URL"
  value       = module.compute.keycloak_url
}

output "mcp_gateway_url" {
  description = "MCP Gateway URL"
  value       = module.compute.mcp_gateway_url
}

# =============================================================================
# DATABASE OUTPUTS
# =============================================================================

output "postgres_private_ip" {
  description = "PostgreSQL private IP (internal only)"
  value       = module.database.postgres_private_ip
}

# =============================================================================
# STORAGE OUTPUTS
# =============================================================================

output "finance_docs_bucket" {
  description = "Finance documents bucket name"
  value       = module.storage.finance_docs_bucket_name
}

output "public_docs_bucket" {
  description = "Public documents bucket name"
  value       = module.storage.public_docs_bucket_name
}

# =============================================================================
# HELPFUL INSTRUCTIONS
# =============================================================================

output "secret_manager_instructions" {
  description = "Instructions for adding the Anthropic API key"
  value       = <<-EOT

    ============================================================
    IMPORTANT: Add your Anthropic API key to Secret Manager:
    ============================================================

    Run this command and paste your API key when prompted:

    echo "sk-ant-api03-YOUR-KEY-HERE" | gcloud secrets versions add \
      tamshai-${local.environment}-claude-api-key --data-file=-

    Then restart the MCP Gateway instance:

    gcloud compute instances reset tamshai-${local.environment}-mcp-gateway \
      --zone=${var.zone}

    ============================================================
  EOT
}

output "ssh_instructions" {
  description = "SSH access instructions (via IAP)"
  value       = <<-EOT

    SSH access is configured via Identity-Aware Proxy (IAP) for security.
    Use gcloud to SSH into instances:

    gcloud compute ssh tamshai-${local.environment}-keycloak --zone=${var.zone} --tunnel-through-iap
    gcloud compute ssh tamshai-${local.environment}-mcp-gateway --zone=${var.zone} --tunnel-through-iap

  EOT
}

output "estimated_monthly_cost" {
  description = "Estimated monthly cost"
  value       = <<-EOT

    Estimated Monthly Cost (${local.environment} Configuration):
    - Keycloak VM (e2-small, ${local.is_production ? "regular" : "preemptible"}): ~$${local.is_production ? "12" : "4"}/month
    - MCP Gateway VM (e2-micro, ${local.is_production ? "regular" : "preemptible"}): ~$${local.is_production ? "6" : "2"}/month
    - Cloud SQL (db-f1-micro): ~$8/month
    - Cloud Storage (minimal): ~$1/month
    - Network egress (minimal): ~$2/month
    - Secret Manager: ~$0.06/secret/month
    ------------------------------------------------
    Total Estimate: ~$${local.is_production ? "35-45" : "17-25"}/month

  EOT
}
