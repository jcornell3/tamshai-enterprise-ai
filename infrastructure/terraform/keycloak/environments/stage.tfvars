# ============================================================
# Staging Environment Configuration (Hetzner VPS)
# ============================================================

# Keycloak connection settings (VPS at 5.78.159.29)
keycloak_url            = "https://5.78.159.29/auth"
keycloak_admin_user     = "admin"
# keycloak_admin_password = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_keycloak_admin_password

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - Staging"

# Test credentials (staging - should be different from dev)
# test_user_password         = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_test_user_password
# mcp_gateway_client_secret  = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_mcp_gateway_client_secret

# Environment
environment = "stage"

# TLS settings (validate certs in staging)
tls_insecure_skip_verify = false

# Valid redirect URIs for staging
valid_redirect_uris = [
  "https://5.78.159.29/*",
  "https://staging.tamshai.com/*",  # If DNS is configured
]
