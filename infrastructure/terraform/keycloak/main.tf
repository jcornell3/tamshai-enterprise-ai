# ============================================================
# Keycloak Realm Configuration
# ============================================================

resource "keycloak_realm" "tamshai_corp" {
  realm             = var.realm_name
  enabled           = true
  display_name      = var.realm_display_name
  display_name_html = "<b>${var.realm_display_name}</b>"

  # Token settings (dev/test use short-lived tokens)
  access_token_lifespan = var.environment == "prod" ? "15m" : "5m"

  # Refresh token settings
  sso_session_idle_timeout = "30m"
  sso_session_max_lifespan = "10h"

  # Security settings
  ssl_required = var.environment == "prod" ? "all" : "external"

  # Login settings
  login_with_email_allowed = true
  duplicate_emails_allowed = false
  remember_me              = true
  verify_email             = var.environment == "prod"
  reset_password_allowed   = true

  # Registration (disabled for production)
  registration_allowed = false

  # Password policy (stronger for production)
  password_policy = var.environment == "prod" ? "length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)" : "length(8)"
}

# ============================================================
# Client Roles (assigned to mcp-gateway client)
# ============================================================

# HR Roles
resource "keycloak_role" "hr_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "hr-read"
  description = "Read access to HR data"
}

resource "keycloak_role" "hr_write" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "hr-write"
  description = "Write access to HR data"
}

# Finance Roles
resource "keycloak_role" "finance_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "finance-read"
  description = "Read access to finance data"
}

resource "keycloak_role" "finance_write" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "finance-write"
  description = "Write access to finance data"
}

# Sales Roles
resource "keycloak_role" "sales_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "sales-read"
  description = "Read access to sales data"
}

resource "keycloak_role" "sales_write" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "sales-write"
  description = "Write access to sales data"
}

# Support Roles
resource "keycloak_role" "support_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "support-read"
  description = "Read access to support data"
}

resource "keycloak_role" "support_write" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "support-write"
  description = "Write access to support data"
}

# Executive Role (composite)
resource "keycloak_role" "executive" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "executive"
  description = "Executive access (read all departments)"

  composite_roles = [
    keycloak_role.hr_read.id,
    keycloak_role.finance_read.id,
    keycloak_role.sales_read.id,
    keycloak_role.support_read.id,
  ]
}

# ============================================================
# MCP Gateway Client
# ============================================================

resource "keycloak_openid_client" "mcp_gateway" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = "mcp-gateway"
  name      = "MCP Gateway"
  enabled   = true

  access_type                  = "CONFIDENTIAL"
  client_secret                = var.mcp_gateway_client_secret
  standard_flow_enabled        = true
  direct_access_grants_enabled = true
  service_accounts_enabled     = true

  valid_redirect_uris = var.valid_redirect_uris
  web_origins         = ["+"] # Allow all valid redirect URIs

  # OAuth/OIDC settings
  full_scope_allowed = true # Include all assigned client roles in tokens
}

# Protocol Mapper: Client Roles in Access Token
# ============================================================
# CRITICAL: Without this mapper, Keycloak does NOT include client roles in the
# resource_access claim, even with full_scope_allowed=true.
#
# This mapper explicitly tells Keycloak to populate:
#   resource_access["mcp-gateway"]["roles"] = ["hr-read", "hr-write", ...]
#
# Without this, the Gateway receives tokens with resource_access: null,
# causing all authorization checks to fail with 401 Unauthorized.
resource "keycloak_openid_user_client_role_protocol_mapper" "mcp_gateway_roles" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = keycloak_openid_client.mcp_gateway.id
  name      = "client-roles-mapper"

  claim_name       = "resource_access.${keycloak_openid_client.mcp_gateway.client_id}.roles"
  claim_value_type = "JSON" # Critical: Must be JSON to render as a list inside the object

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true

  multivalued = true # Ensures it renders as an array
}

# Map realm roles to client scope
resource "keycloak_openid_client_default_scopes" "mcp_gateway_default_scopes" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = keycloak_openid_client.mcp_gateway.id

  default_scopes = [
    "profile",
    "email",
    # Removed "roles" scope - Keycloak includes roles in resource_access claim by default
  ]
}

# ============================================================
# Test Users
# ============================================================

# Alice Chen - HR Manager
resource "keycloak_user" "alice_chen" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "alice.chen"
  enabled    = true
  email      = "alice@tamshai.com"
  first_name = "Alice"
  last_name  = "Chen"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "alice_chen_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.alice_chen.id

  role_ids = [
    keycloak_role.hr_read.id,
    keycloak_role.hr_write.id,
  ]
}

# Bob Martinez - Finance Director
resource "keycloak_user" "bob_martinez" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "bob.martinez"
  enabled    = true
  email      = "bob@tamshai.com"
  first_name = "Bob"
  last_name  = "Martinez"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "bob_martinez_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.bob_martinez.id

  role_ids = [
    keycloak_role.finance_read.id,
    keycloak_role.finance_write.id,
  ]
}

# Carol Johnson - VP of Sales
resource "keycloak_user" "carol_johnson" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "carol.johnson"
  enabled    = true
  email      = "carol@tamshai.com"
  first_name = "Carol"
  last_name  = "Johnson"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "carol_johnson_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.carol_johnson.id

  role_ids = [
    keycloak_role.sales_read.id,
    keycloak_role.sales_write.id,
  ]
}

# Dan Williams - Support Director
resource "keycloak_user" "dan_williams" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "dan.williams"
  enabled    = true
  email      = "dan@tamshai.com"
  first_name = "Dan"
  last_name  = "Williams"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "dan_williams_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.dan_williams.id

  role_ids = [
    keycloak_role.support_read.id,
    keycloak_role.support_write.id,
  ]
}

# Eve Thompson - CEO (Executive)
resource "keycloak_user" "eve_thompson" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "eve.thompson"
  enabled    = true
  email      = "eve@tamshai.com"
  first_name = "Eve"
  last_name  = "Thompson"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

resource "keycloak_user_roles" "eve_thompson_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.eve_thompson.id

  role_ids = [
    keycloak_role.executive.id,
  ]
}

# Frank Davis - Intern (no roles)
resource "keycloak_user" "frank_davis" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "frank.davis"
  enabled    = true
  email      = "frank@tamshai.com"
  first_name = "Frank"
  last_name  = "Davis"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

# Nina Patel - Engineering Manager (no roles yet)
resource "keycloak_user" "nina_patel" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "nina.patel"
  enabled    = true
  email      = "nina@tamshai.com"
  first_name = "Nina"
  last_name  = "Patel"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}

# Marcus Johnson - Software Engineer (no roles yet)
resource "keycloak_user" "marcus_johnson" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "marcus.johnson"
  enabled    = true
  email      = "marcus@tamshai.com"
  first_name = "Marcus"
  last_name  = "Johnson"

  email_verified = true

  initial_password {
    value     = var.test_user_password
    temporary = false
  }
}
