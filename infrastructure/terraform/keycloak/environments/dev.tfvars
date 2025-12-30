# ============================================================
# Development Environment Configuration (Local Docker)
# ============================================================

# Keycloak connection settings
keycloak_url            = "http://localhost:8180"
keycloak_admin_user     = "admin"
keycloak_admin_password = "admin"

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - Development"

# Test credentials (dev only - NOT for production)
test_user_password         = "password123"
mcp_gateway_client_secret  = "test-client-secret"

# Environment
environment = "dev"

# TLS settings (skip verification for local Docker)
tls_insecure_skip_verify = true

# Valid redirect URIs for local development
valid_redirect_uris = [
  "http://localhost:3100/*",
  "http://localhost:3000/*",  # Web UI dev server
]
