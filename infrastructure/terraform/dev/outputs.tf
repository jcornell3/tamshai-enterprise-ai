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

output "tamshai_local_url" {
  description = "Primary HTTPS access URL (requires hosts file entry)"
  value       = local.services.caddy.url
}

# =============================================================================
# KEYCLOAK REALM INFO
# =============================================================================
#
# Realm is loaded from keycloak/realm-export-dev.json via Docker --import-realm
# These values are static references to what's defined in the realm export file.
#

output "realm_name" {
  description = "Keycloak realm name (from realm-export-dev.json)"
  value       = "tamshai"
}

output "mcp_gateway_client_id" {
  description = "MCP Gateway OAuth client ID (from realm-export-dev.json)"
  value       = "mcp-gateway"
}

output "keycloak_realm_info" {
  description = "Keycloak realm configuration info"
  value       = <<-EOT
    Realm: tamshai
    Client ID: mcp-gateway

    Test Users (password: set via DEV_USER_PASSWORD):
      - alice.chen (HR)
      - bob.martinez (Finance)
      - carol.johnson (Sales)
      - dan.williams (Support)
      - eve.thompson (Executive/CEO)
      - frank.davis (Intern)
      - nina.patel (Engineering Manager)
      - marcus.johnson (Engineer)

    Realm source: keycloak/realm-export-dev.json
  EOT
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
    "View logs (all)"         = "docker compose -p ${var.docker_compose_project} logs -f"
    "View logs (mcp-gateway)" = "docker compose -p ${var.docker_compose_project} logs -f mcp-gateway"
    "Check service status"    = "docker compose -p ${var.docker_compose_project} ps"
    "Restart MCP Gateway"     = "docker compose -p ${var.docker_compose_project} restart mcp-gateway"
    "Stop all services"       = "docker compose -p ${var.docker_compose_project} down"
    "Start all services"      = "docker compose -p ${var.docker_compose_project} up -d"
    "Rebuild MCP services"    = "docker compose -p ${var.docker_compose_project} up -d --build mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support"
  }
}

# =============================================================================
# NEXT STEPS
# =============================================================================

output "next_steps" {
  description = "Next steps after Terraform apply"
  sensitive   = true
  value       = <<-EOT
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║ Tamshai Dev Environment - Successfully Deployed!                         ║
    ╚══════════════════════════════════════════════════════════════════════════╝

    🌐 Primary Access URL:
    └─ ${local.services.caddy.url}
       (Accept the self-signed certificate warning in your browser)

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
    1. Open browser: ${local.services.caddy.url}
    2. Accept the self-signed certificate warning
    3. Verify services: docker compose ps
    4. Check logs: docker compose logs -f mcp-gateway

    📚 Documentation:
    - Terraform Guide: infrastructure/terraform/dev/README.md
    - Realm Info: terraform output keycloak_realm_info
    - All Commands: terraform output quick_commands

  EOT
}
