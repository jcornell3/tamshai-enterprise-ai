# Storage Module Outputs

output "finance_docs_bucket_name" {
  description = "Name of the finance documents bucket"
  value       = google_storage_bucket.finance_docs.name
}

output "finance_docs_bucket_url" {
  description = "URL of the finance documents bucket"
  value       = google_storage_bucket.finance_docs.url
}

output "public_docs_bucket_name" {
  description = "Name of the public documents bucket"
  value       = google_storage_bucket.public_docs.name
}

output "public_docs_bucket_url" {
  description = "URL of the public documents bucket"
  value       = google_storage_bucket.public_docs.url
}

output "static_website_bucket_name" {
  description = "Name of the static website bucket"
  value       = try(google_storage_bucket.static_website[0].name, null)
}

output "static_website_bucket_url" {
  description = "URL of the static website bucket"
  value       = try(google_storage_bucket.static_website[0].url, null)
}

output "static_website_url" {
  description = "Public URL for static website"
  value       = try("https://storage.googleapis.com/${google_storage_bucket.static_website[0].name}/index.html", null)
}
