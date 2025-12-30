# ============================================================
# Outputs for Integration Tests and CI
# ============================================================

output "realm_id" {
  description = "The ID of the created realm"
  value       = keycloak_realm.tamshai_corp.id
}

output "realm_name" {
  description = "The name of the created realm"
  value       = keycloak_realm.tamshai_corp.realm
}

output "mcp_gateway_client_id" {
  description = "The client ID for MCP Gateway"
  value       = keycloak_openid_client.mcp_gateway.client_id
}

output "mcp_gateway_client_secret" {
  description = "The client secret for MCP Gateway"
  value       = keycloak_openid_client.mcp_gateway.client_secret
  sensitive   = true
}

output "test_users" {
  description = "Test user credentials for integration tests"
  value = {
    hr_manager = {
      username = keycloak_user.alice_chen.username
      email    = keycloak_user.alice_chen.email
      roles    = ["hr-read", "hr-write"]
    }
    finance_director = {
      username = keycloak_user.bob_martinez.username
      email    = keycloak_user.bob_martinez.email
      roles    = ["finance-read", "finance-write"]
    }
    sales_vp = {
      username = keycloak_user.carol_johnson.username
      email    = keycloak_user.carol_johnson.email
      roles    = ["sales-read", "sales-write"]
    }
    support_director = {
      username = keycloak_user.dan_williams.username
      email    = keycloak_user.dan_williams.email
      roles    = ["support-read", "support-write"]
    }
    executive = {
      username = keycloak_user.eve_thompson.username
      email    = keycloak_user.eve_thompson.email
      roles    = ["executive"]
    }
    intern = {
      username = keycloak_user.frank_davis.username
      email    = keycloak_user.frank_davis.email
      roles    = []
    }
    manager = {
      username = keycloak_user.nina_patel.username
      email    = keycloak_user.nina_patel.email
      roles    = []
    }
    engineer = {
      username = keycloak_user.marcus_johnson.username
      email    = keycloak_user.marcus_johnson.email
      roles    = []
    }
  }
}

output "test_user_password" {
  description = "Password for all test users (same for all in dev/ci)"
  value       = var.test_user_password
  sensitive   = true
}

output "roles_created" {
  description = "List of all roles created"
  value = [
    keycloak_role.hr_read.name,
    keycloak_role.hr_write.name,
    keycloak_role.finance_read.name,
    keycloak_role.finance_write.name,
    keycloak_role.sales_read.name,
    keycloak_role.sales_write.name,
    keycloak_role.support_read.name,
    keycloak_role.support_write.name,
    keycloak_role.executive.name,
  ]
}

output "keycloak_url" {
  description = "Keycloak base URL"
  value       = var.keycloak_url
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}
