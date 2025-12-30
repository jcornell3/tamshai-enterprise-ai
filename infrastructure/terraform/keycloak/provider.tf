provider "keycloak" {
  client_id     = "admin-cli"
  username      = var.keycloak_admin_user
  password      = var.keycloak_admin_password
  url           = var.keycloak_url
  initial_login = false

  # For local dev with self-signed certs
  tls_insecure_skip_verify = var.tls_insecure_skip_verify
}
