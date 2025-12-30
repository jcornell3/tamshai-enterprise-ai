# ============================================================
# CI Environment Configuration (GitHub Actions)
# ============================================================

# Keycloak connection settings (CI uses localhost)
keycloak_url            = "http://localhost:8180"
keycloak_admin_user     = "admin"
keycloak_admin_password = "admin"

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - CI"

# Test credentials (CI only)
test_user_password         = "password123"
mcp_gateway_client_secret  = "test-client-secret"

# Environment
environment = "ci"

# TLS settings (skip verification for CI)
tls_insecure_skip_verify = true

# Valid redirect URIs for CI
valid_redirect_uris = [
  "http://localhost:3100/*",
]
