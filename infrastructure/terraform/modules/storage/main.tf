# Storage Module
# Manages Cloud Storage buckets

# Logs bucket for access logging (CKV_GCP_62)
resource "google_storage_bucket" "logs" {
  name     = "tamshai-${var.environment}-logs-${var.project_id}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = true

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  lifecycle_rule {
    condition {
      age = 90 # Retain logs for 90 days
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    purpose     = "access-logs"
  }
}

resource "google_storage_bucket" "finance_docs" {
  name     = "tamshai-${var.environment}-finance-docs-${var.project_id}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  versioning {
    enabled = var.enable_versioning
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "finance-docs/"
  }

  lifecycle_rule {
    condition {
      age = var.lifecycle_age_days
    }
    action {
      type = "Delete"
    }
  }

  # Uses Google-managed encryption by default (no encryption block needed)

  labels = {
    environment = var.environment
    purpose     = "finance-documents"
  }
}

resource "google_storage_bucket" "public_docs" {
  name     = "tamshai-${var.environment}-public-docs-${var.project_id}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  public_access_prevention = "enforced" # Security: Prevent public access (CKV_GCP_114)

  versioning {
    enabled = true # Security: Enable versioning for data protection (CKV_GCP_78)
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "public-docs/"
  }

  labels = {
    environment = var.environment
    purpose     = "public-documents"
  }
}
