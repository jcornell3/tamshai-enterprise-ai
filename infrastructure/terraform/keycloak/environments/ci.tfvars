# ============================================================
# CI Environment Configuration (GitHub Actions)
# ============================================================
#
# SECRETS: The following variables must be passed via -var flags from GitHub secrets:
#   - keycloak_admin_password (from DEV_KEYCLOAK_ADMIN_PASSWORD)
#   - test_user_password (from DEV_USER_PASSWORD)
#   - mcp_gateway_client_secret (from DEV_MCP_GATEWAY_CLIENT_SECRET)
#   - mcp_integration_runner_secret (from MCP_INTEGRATION_RUNNER_SECRET)
#
# ============================================================

# Keycloak connection settings
# IMPORTANT: keycloak_url is passed via -var flag in CI using ${{ vars.DEV_KEYCLOAK }}
# No hardcoded port here - single source of truth is GitHub Variables
keycloak_admin_user = "admin"
# keycloak_admin_password - MUST be passed via -var flag from GitHub secret

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - CI"

# mcp_gateway_client_secret - MUST be passed via -var flag from GitHub secret
# test_user_password - MUST be passed via -var flag from GitHub secret
# mcp_integration_runner_secret - MUST be passed via -var flag from GitHub secret

# Environment
environment = "ci"

# TLS settings (skip verification for CI)
tls_insecure_skip_verify = true

# valid_redirect_uris - passed via -var flag in CI using ${{ vars.DEV_MCP_GATEWAY }}
# web_origins - passed via -var flag in CI using ${{ vars.DEV_MCP_GATEWAY }}

# OAuth Flows
# ROPC (Resource Owner Password Credentials) DISABLED - migration complete (2026-02-13)
# Tests use token exchange (mcp-integration-runner) and client credentials (admin-cli)
# See docs/security/ROPC_ASSESSMENT.md for security rationale
direct_access_grants_enabled = false
