# Database Module Outputs

output "postgres_instance_name" {
  description = "Name of the PostgreSQL instance"
  value       = google_sql_database_instance.postgres.name
}

output "postgres_connection_name" {
  description = "Connection name for Cloud SQL Proxy"
  value       = google_sql_database_instance.postgres.connection_name
}

output "postgres_private_ip" {
  description = "Private IP address of PostgreSQL instance"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "keycloak_db_name" {
  description = "Name of the Keycloak database"
  value       = google_sql_database.keycloak_db.name
}

output "hr_db_name" {
  description = "Name of the HR database"
  value       = google_sql_database.hr_db.name
}

output "finance_db_name" {
  description = "Name of the Finance database"
  value       = google_sql_database.finance_db.name
}
