# Storage Module
# Manages Cloud Storage buckets

# Logs bucket for access logging
#checkov:skip=CKV_GCP_62:Logs bucket does not log itself (recursive logging not recommended)
#checkov:skip=CKV_GCP_78:Versioning not needed for logs bucket (lifecycle rule deletes after 90 days)
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

# =============================================================================
# STATIC WEBSITE BUCKET (Phase 1)
# =============================================================================

# Static website bucket for prod.tamshai.com
# Note: Bucket name must match domain for CNAME hosting to work
resource "google_storage_bucket" "static_website" {
  count = var.enable_static_website ? 1 : 0

  name     = var.static_website_domain # e.g., "prod.tamshai.com"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true
  force_destroy               = var.force_destroy

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  # Allow public read access for website content
  # Note: This is intentional for static website hosting
  public_access_prevention = "inherited"

  versioning {
    enabled = true # Enable versioning for rollback capability
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "static-website/"
  }

  cors {
    origin          = ["https://${var.static_website_domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = {
    environment = var.environment
    purpose     = "static-website"
  }
}

# Make website bucket publicly readable
resource "google_storage_bucket_iam_member" "static_website_public" {
  count = var.enable_static_website ? 1 : 0

  bucket = google_storage_bucket.static_website[0].name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
