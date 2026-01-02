# ============================================================
# Development Environment Configuration (Local Docker)
# ============================================================

# Keycloak connection settings (KC_HTTP_RELATIVE_PATH=/auth in docker-compose.yml)
keycloak_url            = "http://localhost:8180/auth"
keycloak_admin_user     = "admin"
keycloak_admin_password = "admin"

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - Development"

# Test credentials (dev only - NOT for production)
test_user_password           = "password123"
mcp_gateway_client_secret    = "test-client-secret"
mcp_hr_service_client_secret = "hr-service-dev-secret"

# Environment
environment = "dev"

# TLS settings (skip verification for local Docker)
tls_insecure_skip_verify = true

# Valid redirect URIs for local development
valid_redirect_uris = [
  "http://localhost:3100/*",   # MCP Gateway
  "http://localhost:3000/*",   # Web UI dev server
  "http://localhost:4000/*",   # Web Portal
  "http://localhost:4001/*",   # Web HR
  "http://localhost:4002/*",   # Web Finance
  "http://localhost:4003/*",   # Web Sales
  "http://localhost:4004/*",   # Web Support
]
