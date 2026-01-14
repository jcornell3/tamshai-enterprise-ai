# Bootstrap script to create Terraform state bucket
# Run this first with local backend, then migrate to GCS backend

#checkov:skip=CKV_GCP_62:State bucket access logging not required - access controlled via IAM and Cloud Audit Logs capture API operations.
#checkov:skip=CKV_GCP_114:State bucket uses IAM for access control. Public access prevention added below.
resource "google_storage_bucket" "terraform_state" {
  name          = "tamshai-terraform-state-prod"
  location      = "US"
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

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
