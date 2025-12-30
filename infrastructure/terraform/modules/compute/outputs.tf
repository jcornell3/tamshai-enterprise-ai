# Compute Module Outputs

output "keycloak_instance_name" {
  description = "Name of the Keycloak instance"
  value       = google_compute_instance.keycloak.name
}

output "keycloak_internal_ip" {
  description = "Internal IP of Keycloak instance"
  value       = google_compute_instance.keycloak.network_interface[0].network_ip
}

output "keycloak_external_ip" {
  description = "External IP of Keycloak instance"
  value       = google_compute_instance.keycloak.network_interface[0].access_config[0].nat_ip
}

output "keycloak_url" {
  description = "Keycloak URL"
  value       = "http://${google_compute_instance.keycloak.network_interface[0].access_config[0].nat_ip}:8080"
}

output "mcp_gateway_instance_name" {
  description = "Name of the MCP Gateway instance"
  value       = google_compute_instance.mcp_gateway.name
}

output "mcp_gateway_internal_ip" {
  description = "Internal IP of MCP Gateway instance"
  value       = google_compute_instance.mcp_gateway.network_interface[0].network_ip
}

output "mcp_gateway_external_ip" {
  description = "External IP of MCP Gateway instance"
  value       = google_compute_instance.mcp_gateway.network_interface[0].access_config[0].nat_ip
}

output "mcp_gateway_url" {
  description = "MCP Gateway URL"
  value       = "http://${google_compute_instance.mcp_gateway.network_interface[0].access_config[0].nat_ip}:3100"
}
