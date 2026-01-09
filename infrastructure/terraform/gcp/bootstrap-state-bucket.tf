# Bootstrap script to create Terraform state bucket
# Run this first with local backend, then migrate to GCS backend

resource "google_storage_bucket" "terraform_state" {
  name          = "tamshai-terraform-state-prod"
  location      = "US"
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    purpose     = "terraform-state"
    environment = "production"
    managed-by  = "terraform"
  }
}

output "state_bucket_url" {
  value       = google_storage_bucket.terraform_state.url
  description = "URL of the Terraform state bucket"
}
