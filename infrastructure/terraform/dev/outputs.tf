# =============================================================================
# Terraform Dev Environment - Outputs
# =============================================================================

# =============================================================================
# SERVICE URLS
# =============================================================================

output "services" {
  description = "All service URLs"
  value = {
    for name, config in local.services : name => {
      url  = config.url
      port = config.port
    }
  }
}

output "keycloak_url" {
  description = "Keycloak admin console URL"
  value       = local.services.keycloak.url
}

output "mcp_gateway_url" {
  description = "MCP Gateway API URL"
  value       = local.services.mcp_gateway.url
}

output "web_portal_url" {
  description = "Web Portal URL"
  value       = local.services.web_portal.url
}

output "kong_proxy_url" {
  description = "Kong API Gateway proxy URL"
  value       = local.services.kong_proxy.url
}

# =============================================================================
# KEYCLOAK REALM OUTPUTS (from module)
# =============================================================================

output "realm_name" {
  description = "Keycloak realm name"
  value       = module.keycloak.realm_name
}

output "mcp_gateway_client_id" {
  description = "MCP Gateway OAuth client ID"
  value       = module.keycloak.mcp_gateway_client_id
}

output "mcp_gateway_client_secret" {
  description = "MCP Gateway OAuth client secret"
  value       = module.keycloak.mcp_gateway_client_secret
  sensitive   = true
}

output "test_users" {
  description = "Test user credentials"
  value       = module.keycloak.test_users
  sensitive   = true
}

# =============================================================================
# DOCKER COMPOSE INFO
# =============================================================================

output "docker_compose_dir" {
  description = "Docker Compose directory path"
  value       = local.compose_path
}

output "docker_compose_project" {
  description = "Docker Compose project name"
  value       = var.docker_compose_project
}

output "env_file_path" {
  description = "Generated .env file path"
  value       = local.env_file
}

# =============================================================================
# QUICK ACCESS COMMANDS
# =============================================================================

output "quick_commands" {
  description = "Useful Docker Compose commands"
  value = {
    "View logs (all)"        = "docker compose -p ${var.docker_compose_project} logs -f"
    "View logs (mcp-gateway)" = "docker compose -p ${var.docker_compose_project} logs -f mcp-gateway"
    "Check service status"   = "docker compose -p ${var.docker_compose_project} ps"
    "Restart MCP Gateway"    = "docker compose -p ${var.docker_compose_project} restart mcp-gateway"
    "Stop all services"      = "docker compose -p ${var.docker_compose_project} down"
    "Start all services"     = "docker compose -p ${var.docker_compose_project} up -d"
    "Rebuild MCP services"   = "docker compose -p ${var.docker_compose_project} up -d --build mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support"
  }
}

# =============================================================================
# NEXT STEPS
# =============================================================================

output "next_steps" {
  description = "Next steps after Terraform apply"
  sensitive   = true
  value = <<-EOT
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║ Tamshai Dev Environment - Successfully Deployed!                         ║
    ╚══════════════════════════════════════════════════════════════════════════╝

    🌐 Service URLs:
    ├─ Keycloak Admin:   ${local.services.keycloak.url}
    ├─ MCP Gateway:      ${local.services.mcp_gateway.url}
    ├─ Kong Gateway:     ${local.services.kong_proxy.url}
    ├─ Web Portal:       ${local.services.web_portal.url}
    ├─ PostgreSQL:       localhost:${local.services.postgres.port}
    ├─ MongoDB:          localhost:${local.services.mongodb.port}
    └─ MinIO Console:    ${local.services.minio.url}

    🔐 Keycloak Credentials:
    ├─ Username: admin
    └─ Password: ${var.keycloak_admin_password}

    📋 Next Steps:
    1. Verify services: docker compose ps
    2. Check logs: docker compose logs -f mcp-gateway
    3. Test authentication: curl ${local.services.mcp_gateway.url}/health
    4. Access web portal: ${local.services.web_portal.url}

    📚 Documentation:
    - Terraform Guide: infrastructure/terraform/dev/README.md
    - Test Users: terraform output test_users
    - All Commands: terraform output quick_commands

  EOT
}
