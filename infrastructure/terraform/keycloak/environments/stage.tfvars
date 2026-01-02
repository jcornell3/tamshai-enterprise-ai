# ============================================================
# Staging Environment Configuration (Hetzner VPS)
# ============================================================
#
# IMPORTANT: Use staging.tamshai.com domain instead of IP address
# to avoid reconfiguration if VPS IP changes. Set up DNS A record:
#   staging.tamshai.com -> 5.78.159.29 (or current VPS IP)

# Keycloak connection settings
keycloak_url        = "https://staging.tamshai.com/auth"
keycloak_admin_user = "admin"
# keycloak_admin_password = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_keycloak_admin_password

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - Staging"

# Secrets (staging - provided via TF_VAR_* environment variables or GitHub Secrets)
# test_user_password              = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_test_user_password
# mcp_gateway_client_secret       = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_mcp_gateway_client_secret
# mcp_hr_service_client_secret    = "PROVIDE_VIA_ENV_VAR"  # Set via TF_VAR_mcp_hr_service_client_secret

# Environment
environment = "stage"

# TLS settings (validate certs in staging)
tls_insecure_skip_verify = false

# Valid redirect URIs for staging
# Use domain-based URIs to avoid IP dependency
valid_redirect_uris = [
  "https://staging.tamshai.com/*",           # Catch-all for domain
  "https://staging.tamshai.com/app/*",       # Web Portal (/app/*)
  "https://staging.tamshai.com/hr/*",        # Web HR (/hr/*)
  "https://staging.tamshai.com/finance/*",   # Web Finance (/finance/*)
  "https://staging.tamshai.com/sales/*",     # Web Sales (/sales/*)
  "https://staging.tamshai.com/support/*",   # Web Support (/support/*)
]
